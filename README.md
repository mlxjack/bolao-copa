# Bolao da Copa

Aplicativo simples para organizar um bolao da Copa:

- Participante informa o nome ao entrar.
- Se o nome ainda nao existe, aparecem todos os jogos cadastrados para preencher os palpites.
- Se o nome ja existe, aparecem todos os palpites ja enviados por esse participante.
- Depois de enviar, o palpite fica travado para o participante.
- Administrador entra com login e senha para cadastrar jogos, editar resultados e corrigir palpites.
- Tabela do bolao e tela de jogo ao vivo atualizam a pontuacao com o placar atual.

## Como rodar localmente

Requisitos: Node.js 18 ou mais recente.

```bash
node server.js
```

Depois acesse:

```text
http://localhost:3000
```

## Login do administrador

Por padrao:

```text
Usuario: admin
Senha: admin123
```

Em producao, defina outras credenciais por variaveis de ambiente:

```bash
ADMIN_USER=seu_usuario ADMIN_PASSWORD=sua_senha_forte node server.js
```

No Windows PowerShell:

```powershell
$env:ADMIN_USER="seu_usuario"
$env:ADMIN_PASSWORD="sua_senha_forte"
node server.js
```

## Importar jogos

O projeto ja vem com os 72 jogos da fase de grupos cadastrados em `data/seed-games.json`. Na primeira execucao, se `data/db.json` ainda nao existir, o servidor usa esse arquivo para criar o banco local.

Na area do administrador, voce pode cadastrar jogo por jogo ou colar varias linhas no formato CSV:

```text
Fase;Grupo;2026-06-11T16:00;Brasil;Mexico;Cidade do Mexico
Fase;Grupo;2026-06-12T13:00;Argentina;Chile;Dallas
Oitavas;;2026-06-28T16:00;1A;2B;Nova York/Nova Jersey
```

Formato das colunas:

```text
Fase;Grupo;Data e hora;Mandante;Visitante;Cidade / sede
```

## Pontuacao

- Placar exato: 5 pontos.
- Acertou vencedor ou empate: 3 pontos.
- Errou o resultado: 0 ponto.

Quando o administrador coloca um jogo como **Ao vivo** e informa o placar parcial, a tela "Jogo ao vivo" mostra os palpites daquele jogo e quantos pontos cada participante esta fazendo naquele momento.

## Dados

Os dados ficam no arquivo `data/db.json`, criado automaticamente na primeira execucao. Esse arquivo fica fora do Git por padrao para nao publicar dados reais dos participantes.

## Publicar no GitHub

Este projeto pode ser publicado como reposititorio no GitHub. GitHub Pages nao serve para este app, porque ele precisa de um servidor Node.js e de um lugar persistente para salvar os palpites.

### Opcao simples: Render com disco persistente

1. Suba o projeto para um repositorio no GitHub.
2. No Render, crie um **Web Service** conectado a esse repositorio.
3. Configure:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

4. Adicione um **Persistent Disk** no servico.
5. Use um mount path como:

```text
/opt/render/project/src/storage
```

6. Nas variaveis de ambiente, configure:

```text
DATA_DIR=/opt/render/project/src/storage
ADMIN_USER=seu_usuario
ADMIN_PASSWORD=sua_senha_forte
```

O app cria `db.json` automaticamente dentro desse disco persistente. Assim, os dados continuam salvos mesmo quando o app reiniciar ou receber uma nova versao.

### Opcao mais robusta

Para muitos participantes ou uso mais serio, o ideal e trocar o arquivo `db.json` por um banco Postgres, por exemplo Supabase, Neon, Railway Postgres ou Render Postgres. Essa opcao exige uma pequena migracao no codigo, mas fica melhor para backup, escala e seguranca.
