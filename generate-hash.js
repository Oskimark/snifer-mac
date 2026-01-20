// Simple script to generate password hash for admin user
// Run: node generate-hash.js <password>

import bcrypt from 'bcryptjs';

const password = process.argv[2] || 'admin123';

console.log('Generating password hash...');
console.log('Password:', password);

bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error('Error:', err);
        process.exit(1);
    }

    console.log('\n✅ Hash generated successfully!');
    console.log('\nPassword Hash:');
    console.log(hash);
    console.log('\n📋 Copy this SQL command and run it in your Vercel Postgres dashboard:\n');
    console.log(`INSERT INTO users (email, username, password_hash, role, is_active)`);
    console.log(`VALUES ('elnona@gmail.com', 'oscar', '${hash}', 'admin', true)`);
    console.log(`ON CONFLICT (email) DO UPDATE SET password_hash = '${hash}', role = 'admin';`);
    console.log('\n✅ Done! You can now login at: https://snifer.vercel.app/login.html');
});
