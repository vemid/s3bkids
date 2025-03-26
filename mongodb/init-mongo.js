// Inicijalizacija MongoDB baze podataka s odgovarajućim kredencijalima

// Koristimo admin bazu za autentifikaciju
db = db.getSiblingDB('admin');

// Provjera postoji li već korisnik (za slučaj ponovnog pokretanja)
var adminExists = db.getUser("adminbk");
if (!adminExists) {
  print("Kreiranje admin korisnika...");
}

// Kreiranje productive baze
db = db.getSiblingDB('productgallery');

// Kreiranje kolekcija
db.createCollection('users');
db.createCollection('products');
db.createCollection('seasons');

// Kreiranje indeksa
db.users.createIndex({ "username": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });
db.products.createIndex({ "sku": 1 }, { unique: true });
db.seasons.createIndex({ "prefix": 1 }, { unique: true });

// Provjera postoji li admin korisnik
const adminUserExists = db.users.countDocuments({ username: 'admin' }) > 0;

if (!adminUserExists) {
  // Kreiranje admin korisnika
  const adminUser = {
    username: 'adminbk',
    password: '$2b$10$pRfj3KBh/xN8QJnGvIOm4e/TF3IGcq2QzBb8QVK8G3CXqrfQTSude', // hashirana verzija Admin710412!
    email: 'admin@bebakids.com',
    role: 'admin',
    createdAt: new Date(),
    lastLogin: null
  };

  db.users.insertOne(adminUser);
  print('Admin korisnik kreiran');
}

// Dodavanje sezona ako ne postoje
const seasons = [
  {
    prefix: "1251",
    seasonName: "Proljeće 2023",
    displayOrder: 1,
    active: true
  },
  {
    prefix: "5249",
    seasonName: "Jesen 2024",
    displayOrder: 2,
    active: true
  }
];

seasons.forEach(season => {
  const seasonExists = db.seasons.countDocuments({ prefix: season.prefix }) > 0;

  if (!seasonExists) {
    db.seasons.insertOne({
      ...season,
      createdAt: new Date()
    });
    print(`Sezona ${season.prefix} kreirana`);
  }
});