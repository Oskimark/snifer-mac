// Script to create initial admin user
// Run this file with: node create-admin.js <email> <password> <username>

import bcrypt from 'bcryptjs';
import { sql } from '@vercel/postgres';

async function createAdminUser() {
    const email = process.argv[2] || 'admin@snifer.local';
    const password = process.argv[3] || 'admin123';
    const username = process.argv[4] || 'Admin';

    console.log('Creating admin user...');
    console.log('Email:', email);
    console.log('Username:', username);

    try {
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert user
        const result = await sql`
            INSERT INTO users (email, username, password_hash, role, is_active)
            VALUES (${email.toLowerCase()}, ${username}, ${passwordHash}, 'admin', true)
            ON CONFLICT (email) DO UPDATE 
            SET password_hash = ${passwordHash}, role = 'admin', is_active = true
            RETURNING id, email, username, role
        `;

        console.log('\n✅ Admin user created successfully!');
        console.log('User ID:', result.rows[0].id);
        console.log('Email:', result.rows[0].email);
        console.log('Role:', result.rows[0].role);
        console.log('\n⚠️  IMPORTANT: Change the password after first login!');
        console.log('\nLogin at: https://snifer.vercel.app/login.html');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        process.exit(1);
    }
}

createAdminUser();
