# HiveMQ e ESP32

## Qual opção é gratuita?

Verificado em 16/10/2026: o Cloud Serverless não aceita novos clusters desde 30/09/2026 e os existentes param em 31/12/2026. O Cloud Starter oferece teste de 15 dias. Consulte o [aviso oficial](https://docs.hivemq.com/hivemq-cloud/quick-start-guide.html) e os [preços atuais](https://www.hivemq.com/pricing/).

Para continuar sem assinatura de nuvem, incluímos HiveMQ Community Edition para rodar no seu computador com Docker. O computador precisa permanecer ligado. A edição é [open source](https://github.com/hivemq/hivemq-community-edition); gastos de infraestrutura são seus. Outra opção oficial é o [HiveMQ Lab](https://docs.hivemq.com/hivemq/latest/user-guide/getting-started.html), licença gratuita para testes que precisa ser renovada.

## Opção A: HiveMQ Cloud (teste de 15 dias ou cluster existente)

1. Crie sua conta em [app.hivemq.com](https://app.hivemq.com/).
2. Escolha **Cloud → Starter → Start Free Trial** e crie o cluster. Confira prazo e condições antes de adicionar pagamento.
3. Abra **Manage Cluster → Overview** e copie o host, a **TLS WebSocket URL** e a porta MQTT TLS.
4. Em **Access Management**, crie duas credenciais MQTT, diferentes da senha de login do site. Associe permissões/roles: `hub` pode **Subscribe** em `casa/sensores`; `esp32` pode **Publish** nesse tópico. As credenciais precisam das respectivas roles atribuídas.

No PowerShell, na raiz do projeto:

```powershell
cd hub
if (!(Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
```

Edite `hub/.env.local` com os valores reais:

```dotenv
EXPO_PUBLIC_HIVEMQ_HOST=SEU_CLUSTER.hivemq.cloud
EXPO_PUBLIC_MQTT_URL=
EXPO_PUBLIC_MQTT_TOPIC=casa/sensores
EXPO_PUBLIC_MQTT_USERNAME=hub
EXPO_PUBLIC_MQTT_PASSWORD="SENHA_MQTT_HUB"
EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION=false
```

O host gera `wss://HOST:8884/mqtt`. Para usar exatamente o endereço do painel, preencha `EXPO_PUBLIC_MQTT_URL` com a TLS WebSocket URL: ela tem prioridade sobre o host. Remova URLs antigas de `.env.local` ao trocar de broker. Não use `mqtts://` ou a porta 8883 no aplicativo: esse transporte é do ESP32.

As variáveis `EXPO_PUBLIC_*` ficam visíveis no app distribuído. Por isso, a conta `hub` deve ter apenas permissão de assinatura. Nunca coloque a senha da conta administrativa nessas variáveis. Veja [variáveis de ambiente Expo](https://docs.expo.dev/guides/environment-variables/).

## Opção B: HiveMQ gratuito no seu computador

Instale e inicie o Docker Desktop. Na raiz do projeto:

```powershell
docker compose -f broker/compose.yaml up -d
docker compose -f broker/compose.yaml logs -f
```

Ctrl+C sai dos logs; o broker continua rodando. Para parar, use `docker compose -f broker/compose.yaml stop`. O volume mantém os dados ao reiniciar. Esta configuração usa a [imagem oficial CE](https://github.com/hivemq/hivemq-community-edition), com TCP 1883 e WebSocket 8000, configurados em `broker/config.xml`.

Descubra o IPv4 do computador com `ipconfig`. Computador, celular e ESP32 precisam estar na mesma rede, com acesso entre si. Configure `hub/.env.local` (troque o IP):

```dotenv
EXPO_PUBLIC_HIVEMQ_HOST=
EXPO_PUBLIC_MQTT_URL=ws://192.168.0.100:8000/mqtt
EXPO_PUBLIC_MQTT_TOPIC=casa/sensores
EXPO_PUBLIC_MQTT_USERNAME=
EXPO_PUBLIC_MQTT_PASSWORD=
EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION=false
```

Se necessário, permita as portas 1883/8000 no Firewall apenas na rede privada. Este exemplo permite acesso anônimo e não usa criptografia: use somente em rede de desenvolvimento confiável, sem encaminhar portas no roteador. Para acesso remoto privado, use um endpoint com autenticação e TLS. Uma página HTTPS exige WSS; o WS local serve para desenvolvimento HTTP e testes locais.

## Dados que o ESP32 deve enviar

Publique uma mensagem JSON completa no tópico **`casa/sensores`**:

```json
{"distancia":42.5,"temperatura":25.3,"umidade":61.2,"movimento":false}
```

| Campo | Tipo e unidade |
| --- | --- |
| `distancia` | Número finito, centímetros, >= 0 |
| `temperatura` | Número finito, graus Celsius |
| `umidade` | Número finito, porcentagem de 0 a 100 |
| `movimento` | Booleano `true` ou `false` |

Envie os quatro campos a cada cinco segundos, sem retain. Números usam ponto decimal e não levam aspas; movimento não aceita `0`/`1`. Leituras incompletas, `null` ou JSON inválido são rejeitados e o app preserva a última mensagem válida. O broker transporta mensagens; a validação do conteúdo acontece no aplicativo. O app confirma conexão com o broker, mas não detecta automaticamente um ESP32 parado ou desconectado.

## Firmware de exemplo

O exemplo está em `firmware/esp32_hivemq/esp32_hivemq.ino`, para ESP32 DevKit clássico com DHT22, ultrassônico e PIR, conforme os sensores já usados pelo dashboard. Ajuste se seu hardware for diferente.

1. Na Arduino IDE, instale o suporte **esp32 by Espressif Systems** e selecione sua placa/porta.
2. No gerenciador de bibliotecas, instale **PubSubClient by Nick O'Leary**, **DHT sensor library by Adafruit** e **Adafruit Unified Sensor**.
3. Copie `secrets.example.h` para `secrets.h` na mesma pasta; preencha Wi-Fi, host, tópico e credenciais. `secrets.h` é ignorado pelo Git.
4. Para Cloud: use `MQTT_USE_TLS=true`, porta `8883` (ou a indicada no painel), usuário `esp32` e a senha MQTT correspondente.
5. Preencha `MQTT_ROOT_CA` com a CA raiz PEM da cadeia de certificados do seu endpoint. Abra `https://SEU_HOST:8884` no navegador, inspecione o certificado pelo painel de segurança e exporte a raiz da cadeia em **Base-64/PEM**. A página pode retornar erro HTTP: o objetivo é inspecionar o certificado TLS. Confira a origem da CA no site da autoridade certificadora antes de usá-la. O texto deve incluir `-----BEGIN CERTIFICATE-----` e `-----END CERTIFICATE-----`. Se o endpoint usa outra porta WSS, use essa porta. O código aguarda NTP e valida TLS; uma CA errada impede a conexão.
6. Para o broker Docker local: use `MQTT_USE_TLS=false`, host = IPv4 do computador, porta `1883`, usuário/senha vazios; a CA não é usada nesse modo.
7. Confira os GPIOs antes de gravar: DHT22 = **4**, trigger = **5**, echo = **18**, PIR = **19**. GPIO5 é pino de boot no ESP32 clássico; adapte a ligação se interferir na inicialização. O ECHO de um HC-SR04 alimentado a 5 V precisa de divisor de tensão/conversor para entrada de 3,3 V do ESP32. Use terra comum e confira alimentação/pull-up do seu módulo DHT22.
8. Grave e abra o monitor serial em **115200 baud**. Após conectar, o firmware imprime o JSON publicado. Falha do DHT ou timeout ultrassônico adia a publicação.

O firmware publica com QoS 0, suportado pelo PubSubClient; o app assina com QoS 1, mas a entrega efetiva dessas mensagens continua QoS 0. Não há histórico nem fila de medições durante interrupções.

## Iniciar e testar

Use Node 22.13 ou superior na linha 22 (o Node 22.12 instalado neste ambiente precisa ser atualizado). Dentro de `hub`:

```powershell
npm ci
npm start
```

No navegador, use `npm run web`. Reinicie o Expo e recarregue o app depois de editar o ambiente. Use **dados reais** no dashboard.

Antes de conectar o ESP32 ao Cloud, abra o **Web Client** do cluster, conecte com a credencial `esp32` e publique o JSON de exemplo em `casa/sensores` com o app aberto. Ele deve mostrar 42,5 cm, 25,3 °C, 61,2% e nenhum movimento. Depois ligue a placa e confira as novas mensagens. No broker local, use um cliente MQTT conectado ao IP do PC na porta 1883 para o mesmo teste.

Se conecta mas não chega leitura: confira tópico exato, permissão Publish do ESP32 e Subscribe do app, modo real e nomes/tipos do JSON. Se não conecta ao Cloud: confira credenciais MQTT, endpoint WSS no app e CA/horário NTP no ESP32. O teste de integração só estará concluído quando uma publicação real chegar ao dashboard.
