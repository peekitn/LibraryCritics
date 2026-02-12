# LibraryCritics

Uma aplicação web para **organizar, acompanhar e analisar hábitos de leitura**.  
O projeto permite que cada usuário gerencie sua biblioteca pessoal, visualize estatísticas de leitura e tenha um perfil personalizado.

Inspirado em experiências como *Goodreads* e *Spotify Wrapped*, mas focado em **simplicidade, visual limpo e métricas pessoais**.

---

## ✨ Funcionalidades

### 🔐 Autenticação
- Registro com verificação por e-mail
- Login seguro com senha criptografada (bcrypt)
- Sessões persistentes
- Logout

---

### 📚 Biblioteca Pessoal
- Adicionar livros com:
  - Título
  - Autor
  - Nota (1–10)
  - Data de leitura
  - Tags
  - Notas pessoais
- Busca por título ou autor
- Edição e remoção de livros
- Upload ou busca automática de capa (OpenLibrary API)

---

### 📊 Dashboard de Leitura
- Estatísticas por ano:
  - Total de livros lidos
  - Média mensal
  - Melhor mês
  - Nota média
  - Tag mais recorrente
- Gráfico de evolução mensal
- Comparação com o ano anterior
- Frases e perfis de leitura automáticos
- Estados vazios bem definidos (usuários sem dados)

---

### 👤 Perfil do Usuário
- Foto de perfil (upload)
- Biografia personalizada
- Seleção de até **5 livros favoritos**
- Visualização dos favoritos em destaque
- Interface intuitiva e organizada
- Exclusão permanente da conta (danger zone)

---

### 🎨 UX & UI
- Layout limpo e moderno
- Cards bem espaçados
- Estados vazios amigáveis
- Microinterações (ex: seleção de favoritos)
- Foco em experiência real de uso

---

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js**
- **Express**
- **PostgreSQL**
- **bcrypt**
- **express-session**
- **nodemailer**
- **multer**
- **dotenv**
- **axios**

### Frontend
- **EJS**
- **CSS puro**
- **Chart.js**

---



