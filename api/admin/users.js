import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
    // Verificar autenticación
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    try {
        // Verificar sesión y obtener usuario
        const sessionResult = await sql`
            SELECT u.id, u.email, u.role
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.session_token = ${sessionToken} 
            AND s.expires_at > NOW() 
            AND u.is_active = true
        `;

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({ error: 'Sesión inválida' });
        }

        const currentUser = sessionResult.rows[0];

        // Solo admins pueden acceder
        if (currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
        }

        // GET - Listar usuarios
        if (req.method === 'GET') {
            const result = await sql`
                SELECT id, email, username, role, created_at, last_login, is_active
                FROM users
                ORDER BY created_at DESC
            `;

            return res.status(200).json({ users: result.rows });
        }

        // PATCH - Actualizar rol de usuario
        if (req.method === 'PATCH') {
            const { userId, role } = req.body;

            if (!userId || !role) {
                return res.status(400).json({ error: 'userId y role son requeridos' });
            }

            // Validar rol
            if (!['admin', 'contributor', 'user'].includes(role)) {
                return res.status(400).json({ error: 'Rol inválido' });
            }

            // No permitir que el admin se quite sus propios permisos
            if (userId === currentUser.id && role !== 'admin') {
                return res.status(400).json({ error: 'No puedes cambiar tu propio rol de admin' });
            }

            await sql`
                UPDATE users 
                SET role = ${role} 
                WHERE id = ${userId}
            `;

            return res.status(200).json({ success: true, message: 'Rol actualizado' });
        }

        // DELETE - Eliminar usuario
        if (req.method === 'DELETE') {
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({ error: 'userId es requerido' });
            }

            // No permitir que el admin se elimine a sí mismo
            if (userId === currentUser.id) {
                return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
            }

            // Eliminar usuario (las sesiones se eliminan en cascada)
            await sql`
                DELETE FROM users WHERE id = ${userId}
            `;

            return res.status(200).json({ success: true, message: 'Usuario eliminado' });
        }

        // POST - Crear nuevo usuario
        if (req.method === 'POST') {
            const { email, username, password, role } = req.body;

            if (!email || !password || !role) {
                return res.status(400).json({ error: 'Email, password y role son requeridos' });
            }

            // Validar rol
            if (!['admin', 'contributor', 'user'].includes(role)) {
                return res.status(400).json({ error: 'Rol inválido' });
            }

            // Validar email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: 'Email inválido' });
            }

            // Validar contraseña (mínimo 6 caracteres)
            if (password.length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            }

            try {
                // Verificar si el email ya existe
                const existing = await sql`
                    SELECT id FROM users WHERE email = ${email.toLowerCase()}
                `;

                if (existing.rows.length > 0) {
                    return res.status(400).json({ error: 'El email ya está registrado' });
                }

                // Hash de contraseña
                const passwordHash = await bcrypt.hash(password, 10);

                // Crear usuario
                const result = await sql`
                    INSERT INTO users (email, username, password_hash, role, is_active)
                    VALUES (${email.toLowerCase()}, ${username || null}, ${passwordHash}, ${role}, true)
                    RETURNING id, email, username, role, created_at
                `;

                return res.status(201).json({
                    success: true,
                    message: 'Usuario creado exitosamente',
                    user: result.rows[0]
                });

            } catch (error) {
                console.error('Create user error:', error);
                return res.status(500).json({ error: 'Error creando usuario' });
            }
        }

        // Método no permitido
        return res.status(405).json({ error: 'Método no permitido' });

    } catch (error) {
        console.error('Admin API error:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}
