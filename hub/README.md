# Casa inteligente — Hub ESP32

Aplicativo Expo SDK 57 / React Native para receber leituras de ultrassônico, DHT22 e PIR via MQTT. O PIR é o sensor de movimento infravermelho passivo.

## Fluxo

ESP32 → MQTT TCP (1883) → Mosquitto no computador → MQTT WebSocket (9001) → aplicativo.

O indicador "MQTT conectado" confirma a conexão e a assinatura do tópico; não confirma que o ESP32 está online. Até a primeira mensagem válida, os cartões mostram "—". Ao perder a conexão, as últimas leituras ficam identificadas como antigas. A hora exibida é a de recebimento, não a da medição.

## Configurar o Mosquitto no Windows

Execute os comandos desta seção na raiz do repositório, um nível acima de `hub`.

1. Instale o [Mosquitto para Windows x64](https://mosquitto.org/download/). O caminho padrão usado pelos scripts é `C:\Program Files\mosquitto`. Caso o instalador crie um serviço, não execute o serviço padrão e o broker deste projeto na mesma porta ao mesmo tempo.
2. Execute `ipconfig` e identifique o IPv4 do adaptador Wi-Fi. O celular e o ESP32 precisam alcançar esse computador pela rede.
3. Gere os dois usuários e configure o app (substitua o IP pelo seu):

   ```powershell
   .\broker\setup.ps1 -BrokerHost 10.3.116.125
   ```

   O script cria `hub/.env.local`, `broker/.local/esp32.env` e o arquivo de senhas do Mosquitto. Os arquivos locais estão ignorados pelo Git. O script preserva arquivos existentes e não imprime senhas.

4. Inicie o broker e mantenha esse terminal aberto:

   ```powershell
   .\broker\start.ps1
   ```

   Encerre com Ctrl+C. O script usa explicitamente `broker/mosquitto.conf`, independentemente do arquivo padrão da instalação.

5. Se o Firewall do Windows bloquear a conexão, permita o executável do Mosquitto ou as portas TCP `1883` e `9001` somente para a rede local autorizada. Redes de escolas/empresas e redes de convidados podem isolar os dispositivos; nesse caso use uma rede própria ou consulte o administrador.

A configuração exige autenticação. `hub` pode ler `casa/sensores`; `esp32` pode publicar nesse tópico. As conexões locais usam TCP/WS sem TLS: não encaminhe essas portas no roteador para a internet. Para acesso remoto, configure TLS/WSS e controle de acesso.

## Executar o aplicativo

Use uma versão de Node compatível com as dependências instaladas: Node 22.13 ou superior dentro da linha 22, ou Node 24.3 ou superior dentro da linha 24. O Node 22.12 instalado neste computador está abaixo do mínimo exigido pelo React Native 0.86.3.

Em outro terminal:

```powershell
cd hub
npm install
npm start
```

Abra o app no dispositivo pelo Expo. Para a versão web, use `npm run web`. Se alterar `.env.local`, reinicie o servidor Expo e recarregue o aplicativo.

A URL deve ser `ws://IP_DO_COMPUTADOR:9001`. `localhost` em um celular aponta para o próprio celular. O app não usa a porta TCP 1883. Em uma página HTTPS, configure um broker com WSS.

Variáveis disponíveis em `hub/.env.example`:

- `EXPO_PUBLIC_MQTT_URL`
- `EXPO_PUBLIC_MQTT_TOPIC`
- `EXPO_PUBLIC_MQTT_USERNAME`
- `EXPO_PUBLIC_MQTT_PASSWORD`

Variáveis `EXPO_PUBLIC_*` são incluídas no aplicativo e podem ser extraídas. O usuário do app tem permissão apenas de leitura; não coloque credenciais administrativas nele. Se mudar o tópico, ajuste também `broker/acl` e a publicação no ESP32.

## Configurar a publicação no ESP32

Use os valores de `broker/.local/esp32.env`: host do computador, porta `1883`, usuário `esp32`, senha gerada e tópico `casa/sensores`. Cada ESP32 precisa de um client ID diferente.

Publique todos os campos juntos como JSON:

```json
{
  "distancia": 42.5,
  "temperatura": 25.3,
  "umidade": 61.2,
  "movimento": false
}
```

`distancia` é um número em centímetros (não negativo); `temperatura` é um número em °C; `umidade` vai de 0 a 100; `movimento` é booleano `true`/`false`. Não envie números como strings nem `0`/`1` para movimento. Leituras inválidas ou JSON incompleto são ignorados, mantendo a última leitura válida.

Se o DHT22 falhar, não publique um pacote completo com `NaN`/`null`; aguarde uma leitura válida ou adapte o contrato para suportar falhas por sensor. O firmware não está neste repositório, então o mapeamento dos pinos e a leitura física precisam ser conferidos nele.

## Alternar entre simulação e dados reais

No desenvolvimento, o botão **Usar simulação** no dashboard gera distância, temperatura, umidade e movimento a cada dois segundos, sem depender do broker. O modo fica identificado como **Simulação ativa** e não publica mensagens MQTT.

O botão **Usar dados reais** encerra o simulador, limpa as leituras anteriores e reconecta ao broker. O app inicia no modo real.

Para habilitar o botão em um build de homologação, configure `EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION=true` no ambiente usado ao gerar o aplicativo. Em produção, mantenha a variável ausente ou como `false`: o botão fica oculto. Ao alterar a configuração local, reinicie o Expo e recarregue o app.

## Testar sem os sensores

Com as dependências instaladas e o broker rodando, execute na raiz:

```powershell
node broker/test.cjs
```

Esse teste usa os dois usuários, publica **leituras simuladas** pela porta 1883 e verifica seu recebimento via WebSocket na porta 9001. Se o aplicativo estiver aberto, também exibirá os valores simulados. O teste não usa retain.

Para conferir o projeto:

```powershell
cd hub
npm run lint
npx tsc --noEmit
```

## Limites atuais

A reconexão é automática enquanto o app está em execução. O sistema operacional pode suspender conexões quando o app fica em segundo plano. O projeto ainda não implementa histórico, timestamp de medição, disponibilidade do ESP32 com Last Will nem detecção de sensor sem novas mensagens. Mensagens retidas também podem conter medições antigas.

Referências: [configuração do Mosquitto](https://mosquitto.org/man/mosquitto-conf-5.html), [MQTT.js](https://github.com/mqttjs/MQTT.js), [variáveis do Expo](https://docs.expo.dev/guides/environment-variables/).
