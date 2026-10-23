# Casa inteligente — Site Next.js

Dashboard web independente do app Expo, com o mesmo contrato JSON, serviço MQTT e simulação do projeto `hub`. Interface em português com tema escuro e verde, adaptada para computador e celular.

## Iniciar

No PowerShell, a partir da raiz do repositório:

```powershell
cd next
npm ci
npm run dev
```

Abra http://localhost:3000. Sem configuração MQTT local, o site inicia em **Simulação**, com dados fictícios atualizados a cada dois segundos. A simulação não se conecta ao broker nem publica mensagens.

Requisito: Node.js 22.12 ou superior. O Next.js usa App Router, React e TypeScript.

## Usar o mesmo broker do aplicativo

Dentro de `next`, execute:

```powershell
npm run config:app
npm run dev
```

O comando importa as variáveis MQTT de `hub/.env.local` para `next/.env.local`, inicia em modo real e preserva um arquivo de destino já existente. Não imprime credenciais. A configuração precisa estar válida no aplicativo. Alterações posteriores no app não são sincronizadas automaticamente.

Como alternativa, copie `.env.example` para `.env.local`, preencha a configuração e escolha `NEXT_PUBLIC_SENSOR_MODE=real`:

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_MQTT_URL` | Endereço WebSocket `ws://` ou `wss://` do broker. EMQX deste projeto: porta 8084 e caminho `/mqtt`. |
| `NEXT_PUBLIC_HIVEMQ_HOST` | Alternativa para HiveMQ: host sem protocolo; usa WSS 8884/mqtt quando não há URL explícita. |
| `NEXT_PUBLIC_MQTT_TOPIC` | Tópico exato, padrão `casa/sensores`. |
| `NEXT_PUBLIC_MQTT_USERNAME` | Usuário MQTT com acesso de leitura. |
| `NEXT_PUBLIC_MQTT_PASSWORD` | Senha MQTT. |
| `NEXT_PUBLIC_SENSOR_MODE` | `real` ou `simulation`. |

Reinicie o servidor após editar o ambiente. O Next.js incorpora `NEXT_PUBLIC_*` ao JavaScript enviado ao navegador: a conta deve ter somente permissão de leitura dos sensores. Não use credenciais administrativas. `.env.local` está ignorado pelo Git. Em produção, use HTTPS e WSS; configure as variáveis antes do build. Consulte a [documentação de ambiente do Next.js](https://nextjs.org/docs/app/guides/environment-variables).

## Funcionalidades e limites

- Distância em cm, temperatura em °C, umidade em % e movimento PIR.
- Alternância entre dados reais e simulação, encerrando a conexão anterior e limpando o histórico.
- MQTT 3.1.1, assinatura QoS 1, reconexão e validação de mensagens reaproveitados do app.
- Mensagens inválidas mostram erro e preservam a última leitura válida.
- Aviso quando a última mensagem foi recebida há mais de 15 segundos ou a conexão caiu. Isso não equivale a detectar a disponibilidade da placa.
- Gráfico das últimas 60 leituras da sessão, tabela das cinco mais recentes e exportação CSV das leituras em memória.
- Histórico somente na aba atual; recarregar ou trocar a fonte limpa as leituras. Não há banco de dados ou comandos para atuadores.
- O horário é o de recebimento no navegador. O firmware não envia timestamp de medição; uma mensagem retida pode conter dados antigos mesmo tendo acabado de chegar.

O firmware publica no mesmo tópico e formato já usado pelo app:

```json
{"distancia":42.5,"temperatura":25.3,"umidade":61.2,"movimento":false}
```

Consulte [HIVEMQ.md](../HIVEMQ.md) para infraestrutura e ESP32. App e site podem receber simultaneamente; cada conexão gera seu próprio client ID.

## Verificar e gerar produção

```powershell
npm test
npm run typecheck
npm run build
npm start
```

O site foi criado na pasta `next` e pode ser executado independentemente de `hub`. Não é necessário iniciar o Expo.
