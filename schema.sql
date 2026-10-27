-- ========================================================
-- HARAS IMPERIAL - ESQUEMA DO BANCO DE DADOS MYSQL
-- ========================================================

CREATE DATABASE IF NOT EXISTS haras_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE haras_db;

-- 1. Tabela de Usuários (Haras / Criadores)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabela de Cavalos (Campos fiéis à API Equides: api-equides.org/v1/search)
CREATE TABLE IF NOT EXISTS horses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  api_id VARCHAR(100) NULL,
  nom VARCHAR(150) NOT NULL,
  race VARCHAR(120) NOT NULL,
  sexe VARCHAR(50) NOT NULL,
  annee_naissance INT NULL,
  score DECIMAL(6, 4) DEFAULT 1.0000,
  baia VARCHAR(50) NOT NULL,
  observacoes TEXT NULL,
  status VARCHAR(50) DEFAULT 'Ativo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_horses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para otimização de consultas
CREATE INDEX idx_horses_user ON horses(user_id);
CREATE INDEX idx_horses_nom ON horses(nom);
CREATE INDEX idx_horses_race ON horses(race);
CREATE INDEX idx_horses_sexe ON horses(sexe);

-- Dados Iniciais de Demonstração (Senha: haras123)
-- Hash scrypt gerado para 'haras123'
INSERT IGNORE INTO users (id, name, email, password_hash) VALUES
(1, 'Comendador Haras Imperial', 'demo@haras.com', '0883de6f4d5d257a04a10867c34fbb5c:a3f5aa30dc1eea4a4e1a1e2e5e55a80e796ba625ad56b6f7d32216e0d602fbe618806701cca0e086c1d0aa09f1f578e458dae3f83cbb01fffdbda63aaa866fc3');

-- Inserção de animais iniciais da API Equides para o usuário demo
INSERT IGNORE INTO horses (id, user_id, api_id, nom, race, sexe, annee_naissance, score, baia, observacoes, status) VALUES
(1, 1, 'icF7K_o_Rx6MtVOU1sVePA', 'QAB CALLOWAY FINLAND', 'Origine Non Const. Poney', 'Hongre', 2004, 1.0000, 'Baia #1', 'Campeão de salto categoria pony master. Temperamento dócil.', 'Ativo'),
(2, 1, 'z6P_uMHTRX6_GvyYi7n8PQ', 'QABAH MONTMAJOUR', 'Camargue', 'Male', 1982, 0.3174, 'Baia #2', 'Linhagem pura Camargue, garanhão fundador registrado.', 'Ativo'),
(3, 1, 'CkjRV5fTS2C_l5kERPVTuA', 'QABAQ DE L\'ABBAYE', 'Arabe-Barbe', 'Hongre', 2004, 0.3030, 'Baia #3', 'Excelente resistência física e conformação atlética.', 'Treinamento'),
(4, 1, 'I07wKWTqTfSI13ZVtCsx1A', 'QABAS', 'Arabe', 'Femelle', 2020, 0.2778, 'Baia #4', 'Matriz jovem com pedigree excepcional de adestramento.', 'Reprodução');
