# Usa uma imagem leve do Python
FROM python:3.10-slim

# Define a pasta de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de requisitos e instala as bibliotecas
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o restante do código da aplicação
COPY . .

# Expõe a porta que o Flask/Gunicorn vai usar
EXPOSE 5000

# Comando para rodar a aplicação usando Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]