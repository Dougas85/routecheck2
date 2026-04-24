from flask import Flask, request, jsonify, render_template
import zipfile, re, math, io, os

app = Flask(__name__)

# ─── Haversine ────────────────────────────────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    dLat = (lat2 - lat1) * math.pi / 180
    dLon = (lon2 - lon1) * math.pi / 180
    a = (math.sin(dLat/2)**2
         + math.cos(lat1*math.pi/180)
         * math.cos(lat2*math.pi/180)
         * math.sin(dLon/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# ─── Parse KMZ/KML ───────────────────────────────────────────────────────────
def parse_kmz(file_bytes):
    try:
        buf = io.BytesIO(file_bytes)
        with zipfile.ZipFile(buf) as z:
            kml_name = next((n for n in z.namelist() if n.lower().endswith('.kml')), None)
            if not kml_name:
                raise ValueError("KML não encontrado no KMZ")
            kml_text = z.read(kml_name).decode('utf-8')
    except zipfile.BadZipFile:
        kml_text = file_bytes.decode('utf-8')
    return parse_kml(kml_text)

def parse_kml(text):
    placemarks = re.findall(r'<Placemark[^>]*>(.*?)</Placemark>', text, re.DOTALL)
    stops = []

    for i, pm in enumerate(placemarks):
        code_m   = re.search(r'<td>ID</td>\s*<td>([^<]+)</td>', pm)
        obj_id_m = re.search(r'<td>ObjectId</td>\s*<td>(\d+)</td>', pm)
        coord_m  = re.search(r'<coordinates>\s*([^<]+)\s*</coordinates>', pm)
        name_m   = re.search(r'<n>([^<]+)</n>', pm)

        code   = (code_m.group(1).strip() if code_m
                  else (name_m.group(1).strip() if name_m else f'#{i}'))
        obj_id = int(obj_id_m.group(1)) if obj_id_m else i + 1

        if not coord_m:
            continue

        # KML pode vir em dois formatos:
        # Formato padrão (ponto como decimal):  -51.385348,-22.093647,0
        # Formato BR (vírgula como decimal):    -51,38534832,-22,09364667,0
        # No formato BR o split por vírgula gera 4+ partes; no padrão gera 3.
        raw   = coord_m.group(1).strip().split()[0]
        parts = raw.split(',')

        try:
            if len(parts) >= 4:
                # Formato BR: lon_inteiro,lon_decimal,lat_inteiro,lat_decimal[,alt]
                lon = float(f"{parts[0]}.{parts[1]}")
                lat = float(f"{parts[2]}.{parts[3]}")
            elif len(parts) == 3:
                # Formato padrão KML: lon,lat,alt
                lon, lat = float(parts[0]), float(parts[1])
            elif len(parts) == 2:
                # Sem altitude
                lon, lat = float(parts[0]), float(parts[1])
            else:
                continue
        except (ValueError, IndexError):
            continue

        stops.append({'seq': obj_id, 'code': code, 'lat': lat, 'lon': lon})

    stops.sort(key=lambda x: x['seq'])
    return stops

def parse_actual(text):
    blocks = re.split(r'\n(?=\d+\.\s+[A-Z0-9]+(?:BR|SI))', text.strip())
    stops = []
    for block in blocks:
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        if not lines:
            continue
        hm = re.match(r'^(\d+)\.\s+([A-Z0-9]+(?:BR|SI))', lines[0])
        if not hm:
            continue
        seq, code = int(hm.group(1)), hm.group(2)
        lat = lon = None
        time = status = cep = addr = ''
        dist_m = speed = None
        for l in lines:
            cm = re.search(r'Coordenadas:\s*\(([^,]+),\s*([^)]+)\)', l)
            if cm: lat, lon = float(cm.group(1)), float(cm.group(2))
            tm = re.search(r'Hor[aá]rio:\s*(\d{2}:\d{2})', l)
            if tm: time = tm.group(1)
            sm = re.search(r'Status:\s*(.+)', l)
            if sm: status = sm.group(1).strip()
            cpm = re.search(r'CEP:\s*(\d+)', l)
            if cpm: cep = cpm.group(1)
            am = re.search(r'Endere[cç]o:\s*(.+?)(?:\s*\||$)', l)
            if am: addr = am.group(1).strip()
            dm = re.search(r'Dist[âa]ncia Linear:\s*([\d.,]+)\s*(m|km)', l)
            if dm:
                val = float(dm.group(1).replace(',', '.'))
                dist_m = val * 1000 if dm.group(2) == 'km' else val
            vm = re.search(r'Velocidade:\s*([\d.,]+)', l)
            if vm: speed = float(vm.group(1).replace(',', '.'))
        stops.append({
            'seq': seq, 'code': code,
            'lat': lat, 'lon': lon,
            'time': time, 'status': status,
            'cep': cep, 'addr': addr,
            'dist_m': dist_m, 'speed': speed,
        })
    return stops

def analyze(planned, actual):
    from collections import defaultdict

    # 1. Mapa código → objeto percorrido
    actual_map = {}
    seen = set()
    for a in actual:
        if a['code'] not in seen:
            seen.add(a['code'])
            actual_map[a['code']] = a

    # 2. Construir grupos por coordenada
    coord_to_gid  = {}
    groups        = []   
    code_to_group = {}

    for p in planned:
        # Agrupamento por proximidade de coordenadas (4 casas decimais)
        key = (round(p['lat'], 4), round(p['lon'], 4))
        if key not in coord_to_gid:
            coord_to_gid[key] = len(groups)
            groups.append([])
        gid = coord_to_gid[key]
        groups[gid].append(p)
        code_to_group[p['code']] = gid

    # 3. Calcular a validade do GRUPO com RIGOR no início
    group_data = {}
    for gid, items in enumerate(groups):
        seqs_plan = [p['seq'] for p in items]
        p_min = min(seqs_plan) # Onde o grupo DEVERIA começar
        p_max = max(seqs_plan)
        
        # Sequências reais registradas para este grupo
        seqs_real = [actual_map[p['code']]['seq'] for p in items if p['code'] in actual_map]
        
        if seqs_real:
            arrival_real = min(seqs_real) # A primeira bipada no local
            
            # --- AQUI ESTÁ A MUDANÇA ---
            # REGRA: O motorista chegou no endereço dentro da janela do PRIMEIRO objeto?
            # Se o grupo começa no 6º, ele aceita chegada na 5ª, 6ª ou 7ª posição real.
            is_group_in_order = (p_min - 1) <= arrival_real <= (p_min + 1)
            
            group_data[gid] = {
                'p_min': p_min,
                'p_max': p_max,
                'arrival_real': arrival_real,
                'is_group_in_order': is_group_in_order
            }
        else:
            group_data[gid] = None

    # 4. Avaliar cada objeto
    results    = []
    in_order   = 0
    out_order  = 0
    not_found  = 0
    total_dist = 0.0
    desvios    = []

    for p in planned:
        a = actual_map.get(p['code'])
        gid = code_to_group[p['code']]
        g_info = group_data[gid]

        if not a:
            not_found += 1
            results.append({
                'plan_seq': p['seq'], 'real_seq': None, 'code': p['code'],
                'conformidade': 'nao_encontrado', 'diff': 0
            })
            continue

        # O objeto herda o status do "Check-in" do grupo
        em_ordem = g_info['is_group_in_order']
        real_seq = a['seq']

        if em_ordem:
            in_order += 1
            conf = 'em_ordem'
            diff = 0
        else:
            out_order += 1
            conf = 'fora_de_ordem'
            # O desvio agora é calculado em relação ao início exato planejado
            diff = g_info['arrival_real'] - g_info['p_min']
            desvios.append(abs(diff))

        if a['dist_m']:
            total_dist += a['dist_m']

        # Label para a tabela (mostra o intervalo planejado)
        exp_label = f"{g_info['p_min']}–{g_info['p_max']}"

        results.append({
            'plan_seq': p['seq'],
            'real_seq': real_seq,
            'code': p['code'],
            'time': a['time'],
            'status': a['status'],
            'cep': a['cep'],
            'addr': a['addr'],
            'conformidade': conf,
            'diff': diff,
            'grupo_size': len(groups[gid]),
            'expected_range': exp_label,
            'plan_lat': p['lat'], 'plan_lon': p['lon'],
            'real_lat': a['lat'], 'real_lon': a['lon'],
        })

    # Resumo final
    matched = len(planned) - not_found
    pct = round(in_order / matched * 100) if matched else 0
    avg_desvio = round(sum(desvios) / len(desvios)) if desvios else 0
    times = sorted(r['time'] for r in results if r.get('time'))

    return {
        'summary': {
            'total_planned': len(planned),
            'total_actual': len(actual_map),
            'matched': matched,
            'in_order': in_order,
            'out_order': out_order,
            'not_found': not_found,
            'conformidade_pct': pct,
            'avg_desvio_pos': avg_desvio,
            'total_dist_km': round(total_dist / 1000, 1),
            'start_time': times[0] if times else None,
            'end_time': times[-1] if times else None,
        },
        'results': results,
    }

# ─── Rotas ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    if 'kmz' not in request.files:
        return jsonify({'error': 'Arquivo KMZ/KML não enviado'}), 400
    actual_text = request.form.get('actual', '')
    if not actual_text.strip():
        return jsonify({'error': 'Dados da rota percorrida não informados'}), 400
    try:
        planned = parse_kmz(request.files['kmz'].read())
    except Exception as e:
        return jsonify({'error': f'Erro ao processar KMZ: {str(e)}'}), 422
    if not planned:
        return jsonify({'error': 'Nenhuma parada encontrada no KMZ'}), 422
    actual = parse_actual(actual_text)
    if not actual:
        return jsonify({'error': 'Não foi possível interpretar os dados percorridos'}), 422
    return jsonify(analyze(planned, actual))

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
