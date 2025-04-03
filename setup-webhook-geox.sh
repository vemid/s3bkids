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
./mc alias set myminio http://minio:9000 $MINIO_USER $MINIO_PASSWORD

# Kreiranje bucket-a ako ne postoji
./mc mb --ignore-existing myminio/geox

# Konfiguracija webhook notifikacija za geox servis
./mc admin config set myminio notify_webhook:resize-geox endpoint=http://image-resizer-geox:3000/webhook

# Restartovanje MinIO servera da primeni promene
echo "Restartovanje MinIO servera..."
./mc admin service restart myminio

# Sačekaj da se MinIO restartuje
echo "Čekanje da se MinIO servis ponovo pokrene..."
sleep 15

# Dodavanje webhook notifikacije na bucket geox
echo "Dodavanje webhook notifikacije na geox bucket..."
./mc event add myminio/geox arn:minio:sqs::resize-geox:webhook --event put

# Provera konfiguracije
echo "Trenutna konfiguracija eventa na geox bucket-u:"
./mc event list myminio/geox

echo "Podešavanje webhook notifikacija za geox je završeno."