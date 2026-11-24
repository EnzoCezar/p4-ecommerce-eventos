# ADR 001: Fila para envio de e-mail

## Contexto

O pedido só respondia depois de enviar o e-mail, e se o envio falhasse o pedido falhava junto, mesmo já salvo.

## Decisão

A API salva o pedido, publica numa lista do Redis (`LPUSH`) e responde. Um worker, em outro container, lê a lista com `BRPOP` e envia o e-mail.

Usei lista e não publish/subscribe porque o pub/sub não guarda mensagem: se o worker estiver parado, o pedido se perde. Além disso, com dois workers o e-mail sairia duplicado, já que todos os assinantes recebem a mesma mensagem. Na lista, cada item vai para um só worker.

## Consequências

Os pedidos esperam na fila se o worker cair, e dá para escalar com mais workers sem duplicar e-mail. Em troca, há um serviço a mais (o Redis), e se o worker cair no meio do envio aquele e-mail se perde.