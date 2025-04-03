FROM python:3.9

WORKDIR /usr/src/app

# Instaliranje Java JDK za JDBC
RUN apt-get update && apt-get install -y \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Kreiranje direktorijuma za JDBC drajvere
RUN mkdir -p drivers

# Kopiraj requirements.txt
COPY requirements.txt .

# Instaliraj Python zavisnosti
RUN pip install --no-cache-dir -r requirements.txt

# Kopiraj source kod
COPY sku_translator.py .

# Izloži port
EXPOSE 3002

# Pokreni servis
CMD ["python", "sku_translator.py"]