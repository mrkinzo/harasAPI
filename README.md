# Haras Imperial - Sistema de Gestao Equestre (MySQL & HTML Modular)

Sistema web full-stack para gestao de haras, controle de baias individuais por ID e cadastro de equinos integrado a API oficial api-equides.org, com suporte completo a MySQL e paginas HTML dedicadas.

---

## Configuracao do Banco de Dados MySQL

O sistema suporta nativamente o MySQL via mysql2/promise com pool de conexoes.

### 1. Arquivo de Esquema SQL
Disponibilizamos o arquivo `schema.sql` com a estrutura completa e dados iniciais da API Equides. Voce pode importa-lo no MySQL via terminal ou phpMyAdmin / MySQL Workbench:

```bash
mysql -u root -p < schema.sql
```

Ou deixe que o proprio servidor crie o banco `haras_db` e as tabelas automaticamente na primeira inicializacao.

### 2. Variaveis de Ambiente (.env)
Configure o arquivo `.env` com suas credenciais do MySQL:

```env
PORT=3000
JWT_SECRET=haras-secret-key-equides-mysql-2026

# Conexao MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=haras_db
```

> Nota de Resiliencia: Caso o servico MySQL ainda nao tenha sido iniciado na sua maquina no momento em que voce rodar o servidor, o sistema exibira um aviso amigavel e ativara automaticamente o fallback local para que voce possa continuar navegando e testando sem travamentos.

---

## Arquivos HTML Modulares Gerados

O sistema possui arquivos HTML dedicados e independentes dentro da pasta `public/`:

| Arquivo HTML | Funcao e Recursos |
|---|---|
| `public/login.html` | Tela dedicada de autenticacao (Login e Cadastro de Haras), com botao para usuario Demo. |
| `public/index.html` | Painel Principal / Visao Geral com indicadores do plantel (Total, Baias Ocupadas, Racas, Idade Media) e atalhos rapidos. |
| `public/cavalos.html` | Pagina dedicada ao CRUD de Animais, com alternancia entre Cards e Tabela, filtros em tempo real e modais de cadastro/edicao. |
| `public/baias.html` | Pagina do Mapa Arquitetonico das Baias, exibindo cada cocheira vinculada estritamente ao ID gerado no MySQL. |
| `public/equides.html` | Pagina de Pesquisa Oficial na API Equides (api-equides.org), com importacao direta para o seu Haras em 1 clique. |

---

## Funcionalidades Integradas

1. Usuario Completo: Nome, E-mail e Senha protegida por scrypt.
2. Sessao Persistente no localhost: Token JWT armazenado no localStorage, permitindo fechar ou recarregar qualquer uma das paginas HTML sem perder a sessao.
3. Alocacao Estrita de Baias por ID: O cavalo de ID 1 ocupa a Baia #1, o de ID 2 a Baia #2, etc.
4. CRUD Completo: Criar, Listar com filtros, Editar, Excluir e Visualizar Ficha Tecnica Oficial.
5. Design Minimalista: Estetica em preto e branco de alta clareza e contraste.

---

## Como Executar

```bash
# Iniciar o servidor
npm start
# ou
node server.js
```

Abra o navegador em:
**http://localhost:3000** (ou diretamente em `http://localhost:3000/login.html`)

### Credenciais Demo Pre-cadastradas:
- E-mail: demo@haras.com
- Senha: haras123
