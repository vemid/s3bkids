#!/bin/bash

# Učitaj vrednosti iz .env fajla
source .env

# Preuzimanje MinIO klijenta ako već ne postoji
if [ ! -f ./mc ]; then
  echo "Preuzimanje MinIO klijenta..."
  wget https://dl.min.io/client/mc/release/linux-amd64/mc
  chmod +x mc
fi

# Podešavanje aliasa za vaš MinIO server sa vašim kredencijalima
./mc alias set myminio http://localhost:9000 $MINIO_USER $MINIO_PASSWORD

# Kreiranje bucket-a ako ne postoji
./mc mb --ignore-existing myminio/products

# Konfiguracija webhook notifikacija uz korišćenje vašeg webhook endpoint-a
./mc admin config set myminio notify_webhook:resize endpoint=http://localhost:3000/webhook

# Restartovanje MinIO servera da primeni promene
echo "Restartovanje MinIO servera..."
./mc admin service restart myminio

# Sačekaj da se MinIO restartuje
echo "Čekanje da se MinIO servis ponovo pokrene..."
sleep 15

# Dodavanje webhook notifikacije na bucket
echo "Dodavanje webhook notifikacije na products bucket..."
./mc event add myminio/products arn:minio:sqs::resize:webhook --event put

# Provera konfiguracije
echo "Trenutna konfiguracija eventa na products bucket-u:"
./mc event list myminio/products

echo "Podešavanje webhook notifikacija je završeno."
