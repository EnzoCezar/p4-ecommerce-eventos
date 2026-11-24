# E-commerce — Projeto 4

API de e-commerce em Node.js, TypeScript e Express, organizada em camadas e com injeção de dependências (InversifyJS). A aplicação e o banco rodam em containers com Docker Compose, o banco é o **PostgreSQL** e há a rota `GET /orders/:id`. Neste projeto, a API não envia mais o e-mail: ela salva o pedido, publica numa fila do **Redis** e responde. Um **worker**, em outro container, lê a fila e envia o e-mail.

## Como rodar

Requisitos: **Docker** e **Docker Compose** (com o Docker Desktop aberto, no Windows).

1. Crie o arquivo `.env` a partir do modelo:
   ```bash
   cp .env.example .env
   ```
   No PowerShell, use `Copy-Item .env.example .env`.

2. Suba tudo (API, banco, Redis e worker):
   ```bash
   docker compose up --build
   ```
   Na primeira vez, o build leva alguns minutos. A API está pronta quando o log mostrar `Server rodando em http://localhost:3000`, e o worker, quando mostrar `Worker aguardando pedidos...`.

3. Para parar:
   ```bash
   docker compose down
   ```
   Os dados ficam guardados no volume `dados-banco`, então `docker compose down` e `docker compose up` de novo **não apagam os pedidos**. Para apagar também os dados, use `docker compose down -v`.

### Observações

- O PostgreSQL **não publica porta** no host. Só a API (porta 3000) é acessível de fora; ela conversa com o banco pela rede interna do Compose, usando o serviço `banco`.
- A API só inicia depois que o banco estiver pronto (`healthcheck` + `depends_on`).
- O Redis também **não publica porta** no host; só a API e o worker o acessam, pela rede interna do Compose.
- O worker usa a mesma imagem da API, mas executa `npm run worker`.
- Como o `DATABASE_URL` e o `REDIS_URL` apontam para os serviços `banco` e `redis`, o projeto deve ser executado pelo Docker Compose. Rodar `npm run dev` direto na máquina exige um PostgreSQL e um Redis locais, com `DATABASE_URL` e `REDIS_URL` usando `localhost`.

## Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/orders` | Cria um pedido |
| GET | `/orders/:id` | Devolve o pedido com o `id` informado |

Respostas de `GET /orders/:id`:

- **200**: o pedido (`id`, `customer`, `items`, `total`, `status`, `createdAt`).
- **404**: o pedido não existe.
- **400**: o `id` não é um número inteiro.

## Como testar

Com a API rodando, use os comandos abaixo. Os produtos cadastrados são o ID 1 (livro físico, com frete de R$ 10,00) e o ID 2 (e-book, sem frete).

### Criar um pedido

Linux, Mac ou Git Bash:

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":"cliente@ethereal.email","items":[{"productId":1,"quantity":1}],"paymentMethod":"pix"}'
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/orders -ContentType "application/json" -Body '{"customer":"cliente@ethereal.email","items":[{"productId":1,"quantity":1}],"paymentMethod":"pix"}'
```

A resposta traz só o `orderId`. O e-mail é enviado pelo worker, e o link do Ethereal com a confirmação aparece no log dele:

```bash
docker compose logs worker
```

Exemplo com cartão de crédito:

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":"cliente@ethereal.email","items":[{"productId":2,"quantity":1}],"paymentMethod":"credit_card","paymentDetails":{"cardNumber":"1234567812345678","cvv":"123"}}'
```

### Buscar um pedido

Use o `orderId` devolvido na criação:

```bash
curl -i http://localhost:3000/orders/1
```

Um `id` que não existe devolve 404:

```bash
curl -i http://localhost:3000/orders/999
```

No PowerShell, use `curl.exe` (sem o alias do `Invoke-WebRequest`) para os comandos `GET` com `-i`.

### Testar a persistência

1. Crie um pedido e anote o `orderId`.
2. Rode `docker compose down` e depois `docker compose up`.
3. Busque o mesmo pedido com `GET /orders/<id>`: ele continua lá.

### Testar a fila

Com o worker parado, os pedidos esperam na fila e os e-mails saem quando ele volta:

```bash
docker compose stop worker
# crie alguns pedidos (a API responde normalmente)
docker compose exec redis redis-cli LLEN orders:email   # mostra quantos esperam
docker compose start worker                              # os e-mails são enviados
```

Com dois workers, cada pedido é enviado uma vez só:

```bash
docker compose up -d --scale worker=2
docker compose logs worker
```

## Modos de execução (APP_ENV)

O modo é escolhido pela variável `APP_ENV` no `.env`. As classes são trocadas apenas no `src/container/container.ts`, sem alterar services nem controllers.

| APP_ENV | E-mail | Pedidos |
|---------|--------|---------|
| `dev`   | Ethereal (envio de teste real, precisa de internet) | Salvos no PostgreSQL via Prisma |
| `test`  | Impresso no console do worker | Guardados em memória, somem ao reiniciar |

Para trocar de modo, mude o `APP_ENV` no `.env`, rode `docker compose down` e suba de novo, pois a variável é lida uma vez na inicialização. A rota `GET /orders/:id` funciona nos dois modos. No modo `test`, os produtos ainda vêm do banco.

## Arquitetura em camadas

```
OrderController  ->  OrderService  ->  IOrderRepository
   (HTTP)             (regras)          (Prisma ou memória)
```

- **Controller:** só trata HTTP. Lê os dados da requisição e devolve o status e o JSON. Nunca acessa um repositório nem o Prisma.
- **Service:** contém a regra de negócio. Por exemplo, pedido inexistente é um erro (`OrderNotFoundError`).
- **Repositório:** busca e grava os dados. Há duas implementações da mesma interface: `PrismaOrderRepository` (modo `dev`) e `InMemoryOrderRepository` (modo `test`).
- **Container:** `src/container/container.ts` é o único lugar que conhece as classes concretas.
- **Fila e worker:** o `OrderService` publica o pedido através da interface `IOrderQueue`; a implementação `RedisOrderQueue` grava numa lista do Redis (`LPUSH`). O `src/worker.ts` lê a lista (`BRPOP`) e chama o `NotificationService`. Nenhum arquivo de `services/` ou `controllers/` importa o Redis.

  ```
  OrderService -> IOrderQueue (Redis) -> worker -> NotificationService
  ```

  A decisão de usar lista, e não publish/subscribe, está em `docs/adr-001-fila-de-email.md`.

A troca do SQLite pelo PostgreSQL mudou só a infraestrutura (`schema.prisma`, `.env` e Docker). Nenhum arquivo de `services/` ou `controllers/` foi alterado por causa dessa troca.

## Estrutura de arquivos

```text
.
├── Dockerfile                       # Imagem da API e do worker (Node 20)
├── compose.yaml                     # Serviços: banco (PostgreSQL), redis, api e worker
├── .dockerignore
├── .env.example                     # Modelo do .env (APP_ENV, credenciais e DATABASE_URL)
├── docs/
│   └── adr-001-fila-de-email.md     # Decisão: fila de e-mail com lista do Redis
├── prisma/
│   ├── schema.prisma                # Modelos Product e Order (PostgreSQL)
│   └── seed.ts                      # Cadastra os produtos iniciais
└── src/
    ├── container/                   # Container de IoC (InversifyJS)
    │   ├── types.ts                   # Símbolos usados para injetar as dependências
    │   └── container.ts               # Único lugar que conhece as classes concretas
    ├── controllers/                 # Camada HTTP
    │   └── OrderController.ts         # processOrder (POST) e getOrder (GET)
    ├── domain/                      # Regras de negócio puras
    │   ├── BusinessError.ts           # Erro de regra de negócio (vira 400)
    │   ├── OrderNotFoundError.ts      # Pedido não encontrado (vira 404)
    │   ├── IProduct.ts                # Contrato do produto
    │   ├── PhysicalProduct.ts         # Produto físico (frete R$ 10)
    │   ├── DigitalProduct.ts          # Produto digital (sem frete)
    │   └── ProductFactory.ts          # Cria o produto certo a partir do banco
    ├── services/                    # Regras do fluxo do pedido
    │   ├── OrderService.ts            # execute (cria o pedido) e findById (busca)
    │   └── NotificationService.ts     # Monta o e-mail de confirmação
    ├── queues/                      # Fila de pedidos
    │   ├── IOrderQueue.ts             # Contrato da fila (publish)
    │   └── RedisOrderQueue.ts         # Publica o pedido numa lista do Redis (LPUSH)
    ├── providers/                   # Ferramentas externas (e-mail)
    │   ├── IMailProvider.ts           # Contrato de envio de e-mail
    │   ├── EtherealMailProvider.ts    # Modo dev: envio via Nodemailer (Ethereal)
    │   └── ConsoleMailProvider.ts     # Modo test: imprime o e-mail no console
    ├── repositories/                # Acesso a dados
    │   ├── IOrderRepository.ts        # Contrato de pedidos (create e findById)
    │   ├── PrismaOrderRepository.ts   # Modo dev: pedidos no PostgreSQL com Prisma
    │   ├── InMemoryOrderRepository.ts # Modo test: pedidos em memória
    │   ├── IProductRepository.ts      # Contrato de produtos
    │   └── PrismaProductRepository.ts # Produtos com Prisma
    ├── payments/                    # Formas de pagamento
    │   ├── IPaymentMethod.ts          # Contrato de pagamento
    │   ├── CreditCardPayment.ts       # Cartão de crédito
    │   ├── DebitCardPayment.ts        # Cartão de débito
    │   ├── PixPayment.ts              # Pix
    │   └── PaymentMethodRegistry.ts   # Escolhe o pagamento pelo nome
    ├── lib/
    │   └── logger.ts                  # Configuração do Winston
    ├── app.ts                         # Express e rotas
    ├── server.ts                      # Inicia o servidor
    └── worker.ts                      # Lê a fila (BRPOP) e envia os e-mails
```
