-- Snifer Authentication System - Database Schema
-- Execute this file to create the authentication tables

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    username VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- 'admin', 'contributor', 'user'
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Tabla de sesiones
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Modificar tabla de alias de MACs (agregar user_id)
ALTER TABLE mac_aliases 
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Crear índices para performance
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_mac_aliases_user_id ON mac_aliases(user_id);

-- Insertar usuario admin inicial
-- IMPORTANTE: Cambiar el email por el tuyo
-- Password por defecto: "admin123" (CAMBIAR DESPUÉS DEL PRIMER LOGIN)
INSERT INTO users (email, username, password_hash, role, is_active)
VALUES (
    'admin@snifer.local', 
    'Admin', 
    '$2a$10$rKvVPZqGhqGqGqGqGqGqGOeKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK', -- Hash de "admin123"
    'admin', 
    true
)
ON CONFLICT (email) DO NOTHING;

-- Limpiar sesiones expiradas (ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
