const bcrypt = require('bcrypt');
const password = 'Admin710412!';

bcrypt.hash(password, 10)
    .then(hash => {
        console.log(`Lozinka: ${password}`);
        console.log(`Hash: ${hash}`);
    })
    .catch(err => console.error(err));