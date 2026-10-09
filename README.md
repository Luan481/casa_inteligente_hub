# Casa inteligente — Hub ESP32

Aplicativo de monitoramento de distância, temperatura, umidade e movimento, feito com Expo SDK 57, React Native 0.86, TypeScript e MQTT.js 5.

## Como funciona

```text
ESP32 (ultrassônico, DHT22 e PIR)
  └─ MQTT TCP :1883 → Mosquitto no computador
                       └─ MQTT WebSocket :9001 → aplicativo
```

O aplicativo é assinante: recebe JSON no tópico `casa/sensores` e exibe as leituras. Ele não controla atuadores nem publica comandos.

**“MQTT conectado” confirma a conexão com o broker e a assinatura do tópico; não confirma que o ESP32 está online.**

## Testar a interface agora, sem MQTT

Tutorial completo: [testes no navegador, Android e iPhone](TESTES.md), com roteiro de verificação, soluções de conexão e teste MQTT.

Na raiz do repositório:

```powershell
cd hub
npm ci
npm run test:ui
```

Se as dependências já estiverem instaladas, basta executar `npm run test:ui` dentro de `hub`.

O navegador abre no endereço informado pelo Expo (normalmente `http://localhost:8081`). O dashboard começa com **Simulação ativa**, já exibe valores e atualiza distância, temperatura, umidade e movimento a cada dois segundos. Não é necessário instalar Mosquitto, preencher senhas ou conectar um ESP32.

Para testar no celular, execute `npm run test:mobile` e abra o QR code usando um cliente Expo compatível com o SDK 57. Computador e celular precisam conseguir se comunicar pela rede.

- Use **Usar dados reais** para testar o MQTT configurado no seu ambiente; **Usar simulação** volta aos dados fictícios.
- Recarregar a página durante essa sessão reinicia no modo simulado.
- Encerre com **Ctrl+C**. Para iniciar no modo real novamente, use `npm start` ou `npm run web`.
- Se outro Expo já estiver aberto, encerre-o ou aceite outra porta; use o endereço da sessão de teste.
- O script configura `EXPO_PUBLIC_SENSOR_MODE=simulation` e habilita a simulação somente no processo de teste. Ele preserva seus arquivos `.env` e `.env.local` e não publica mensagens MQTT.
- Os requisitos de Node e de cliente Expo da seção abaixo também se aplicam a esse modo.

## Requisitos

- Node.js compatível com as dependências: na linha 22, use **22.13.0 ou superior**; na linha 24, **24.3.0 ou superior**. Confira com `node --version`.
- npm e as dependências de `hub/package-lock.json`.
- [Mosquitto para Windows](https://mosquitto.org/download/) com suporte a WebSockets.
- Computador, ESP32 e celular com acesso entre si pela rede local.
- Para celular, um cliente Expo compatível com o SDK 57 ou um development build. Consulte a [documentação do SDK 57](https://docs.expo.dev/versions/v57.0.0/).

Os exemplos abaixo usam **PowerShell no Windows** e a instalação do Mosquitto em `C:\Program Files\mosquitto`. Ajuste esse caminho se necessário. A configuração é para desenvolvimento em rede local confiável; TCP/WS não criptografam a comunicação. Para acesso remoto, configure TLS/WSS.

## 1. Descobrir o endereço do computador

Execute:

```powershell
ipconfig
```

Anote o IPv4 do adaptador conectado à rede dos dispositivos, por exemplo `192.168.0.100`. Esse será o host do broker. Não use o IP do ESP32.

No celular, `localhost` aponta para o próprio celular. Reserve o IP do computador no DHCP do roteador se quiser evitar mudanças.

## 2. Criar os usuários do Mosquitto

Os arquivos locais do broker ficarão fora do repositório, em `%LOCALAPPDATA%\casa-inteligente-mqtt`. Em um terminal PowerShell:

```powershell
$mqttDir = Join-Path $env:LOCALAPPDATA 'casa-inteligente-mqtt'
New-Item -ItemType Directory -Force -Path $mqttDir | Out-Null
$mqttPasswordFile = Join-Path $mqttDir 'passwd'

# Primeira execução: cria o arquivo e pede a senha do usuário hub.
if (!(Test-Path -LiteralPath $mqttPasswordFile)) {
    & 'C:\Program Files\mosquitto\mosquitto_passwd.exe' -c $mqttPasswordFile hub
} else {
    Write-Output 'Arquivo de senhas existente; preservado.'
}

# Adiciona o usuário esp32, ou atualiza sua senha se ele já existir.
& 'C:\Program Files\mosquitto\mosquitto_passwd.exe' $mqttPasswordFile esp32
```

Escolha senhas diferentes e guarde-as: a de `hub` será usada no aplicativo; a de `esp32`, no firmware e no teste de publicação.

Para alterar a senha de `hub` posteriormente, use o mesmo comando **sem `-c`**:

```powershell
& 'C:\Program Files\mosquitto\mosquitto_passwd.exe' $mqttPasswordFile hub
```

A opção `-c` recria o arquivo e pode apagar os demais usuários. Veja o [manual de mosquitto_passwd](https://mosquitto.org/man/mosquitto_passwd-1.html).

## 3. Configurar TCP, WebSocket e permissões

No mesmo terminal, execute o bloco abaixo. Ele grava a configuração de exemplo e a ACL; se você já personalizou esses dois arquivos, preserve suas alterações antes de executar novamente.

```powershell
$mqttDir = Join-Path $env:LOCALAPPDATA 'casa-inteligente-mqtt'
$mqttConfigDir = $mqttDir.Replace('\', '/')

$mqttAcl = @"
user hub
topic read casa/sensores

user esp32
topic write casa/sensores
"@

$mqttConfig = @"
allow_anonymous false
password_file $mqttConfigDir/passwd
acl_file $mqttConfigDir/acl

listener 1883 0.0.0.0
protocol mqtt

listener 9001 0.0.0.0
protocol websockets

persistence false
log_dest stdout
"@

# WriteAllText usa UTF-8 sem BOM.
[System.IO.File]::WriteAllText((Join-Path $mqttDir 'acl'), $mqttAcl)
[System.IO.File]::WriteAllText((Join-Path $mqttDir 'mosquitto.conf'), $mqttConfig)
```

A ACL permite a `hub` ler e a `esp32` publicar apenas em `casa/sensores`. Os dois listeners exigem autenticação. Se mudar o tópico, atualize a ACL, o aplicativo e o firmware. Referência: [configuração do Mosquitto](https://mosquitto.org/man/mosquitto-conf-5.html).

Inicie o broker e mantenha o terminal aberto:

```powershell
$mqttDir = Join-Path $env:LOCALAPPDATA 'casa-inteligente-mqtt'
& 'C:\Program Files\mosquitto\mosquitto.exe' -c (Join-Path $mqttDir 'mosquitto.conf') -v
```

Encerre com Ctrl+C. Reinicie o processo após alterar a configuração, as senhas ou a ACL.

Se o instalador já iniciou um serviço Mosquitto, ele pode estar ocupando a porta 1883. Confira no aplicativo **Serviços** do Windows e use apenas uma instância nessas portas, carregando a configuração correta.

Se necessário, permita o Mosquitto ou as portas TCP **1883 e 9001** no Firewall do Windows para a rede local autorizada. Não encaminhe essas portas para a internet. Redes de convidados, escolas e empresas podem impedir a comunicação entre dispositivos.

## 4. Configurar o aplicativo

Na raiz do repositório:

```powershell
cd hub
npm ci

# Preserva uma configuração local já existente.
if (!(Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
```

Edite `hub/.env.local`:

```dotenv
EXPO_PUBLIC_MQTT_URL=ws://192.168.0.100:9001
EXPO_PUBLIC_MQTT_TOPIC=casa/sensores
EXPO_PUBLIC_MQTT_USERNAME=hub
EXPO_PUBLIC_MQTT_PASSWORD="SUBSTITUA_PELA_SENHA_DO_USUARIO_HUB"
EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION=false
```

Troque o IP e a senha pelos valores configurados. As aspas ajudam a preservar caracteres como `#` na senha.

| Variável | Uso |
| --- | --- |
| `EXPO_PUBLIC_MQTT_URL` | URL obrigatória com `ws://` ou `wss://`; neste exemplo, porta 9001. |
| `EXPO_PUBLIC_MQTT_TOPIC` | Tópico exato; padrão `casa/sensores`. O app rejeita curingas `+` e `#`. |
| `EXPO_PUBLIC_MQTT_USERNAME` | Usuário do aplicativo; `hub` neste exemplo. |
| `EXPO_PUBLIC_MQTT_PASSWORD` | Senha do usuário `hub`; não deixe vazia nesta configuração. |
| `EXPO_PUBLIC_ENABLE_SENSOR_SIMULATION` | `true` permite simulação em builds de homologação; em desenvolvimento o botão já aparece. |

O Expo carrega os arquivos `.env` e `.env.local`; valores de `.env.local` têm prioridade sobre `.env`. Evite manter configurações conflitantes. Depois de editar, reinicie o Expo e recarregue completamente o app.

As variáveis `EXPO_PUBLIC_*` são incorporadas ao aplicativo e podem ser lidas por quem o utiliza. Use uma conta restrita à leitura, nunca credenciais administrativas. Os arquivos locais de ambiente estão ignorados pelo Git. Referência: [variáveis de ambiente do Expo](https://docs.expo.dev/guides/environment-variables/).

Ainda dentro de `hub`:

```powershell
npm start
```

Abra no cliente Expo compatível. Para testar no navegador:

```powershell
npm run web
```

O app usa **WebSocket**, portanto `mqtt://IP:1883` não funciona nele. Em uma página HTTPS, utilize `wss://` com certificado confiável e a porta/caminho definidos pelo broker. Em serviços gerenciados, use o endpoint WebSocket informado pelo provedor.

## 5. Configurar o ESP32

O firmware não está incluído neste repositório. Nele, configure:

| Parâmetro | Valor para este exemplo |
| --- | --- |
| Rede | SSID e senha do Wi-Fi acessível ao computador |
| Host MQTT | IPv4 do computador, sem `ws://` |
| Porta MQTT | `1883` |
| Usuário | `esp32` |
| Senha | A senha criada para `esp32` |
| Tópico | `casa/sensores` |
| Client ID | Um identificador diferente para cada dispositivo |

Publique todos os campos juntos, como JSON:

```json
{
  "distancia": 42.5,
  "temperatura": 25.3,
  "umidade": 61.2,
  "movimento": false
}
```

| Campo | Formato aceito |
| --- | --- |
| `distancia` | Número finito em centímetros, maior ou igual a zero |
| `temperatura` | Número finito em graus Celsius |
| `umidade` | Número finito entre 0 e 100 |
| `movimento` | Booleano `true` ou `false` |

Números entre aspas, `0`/`1` para movimento, campos ausentes e valores `null` são rejeitados. Quando uma mensagem é inválida, o app mantém a última leitura válida e mostra o erro.

Confira a leitura dos sensores e os pinos no firmware. Se o DHT22 falhar, espere uma leitura válida ou adapte o contrato e o app para representar falhas por sensor.

## 6. Testar sem o ESP32

### Simulação da interface

Clique em **Usar simulação**. Os dados fictícios mudam a cada dois segundos, sem conexão nem publicação MQTT. **Usar dados reais** encerra a simulação, limpa as leituras e cria a conexão MQTT novamente.

Esse modo testa a interface; ele não verifica o broker.

### Publicação real pelo broker

Com o broker rodando e o aplicativo no modo real, abra outro PowerShell. Este comando publica uma leitura de teste como `esp32` pela porta TCP; o aplicativo deve recebê-la pela porta WebSocket:

```powershell
$mqttTestPassword = Read-Host 'Senha do usuario esp32' -AsSecureString
$mqttTestCredential = [System.Net.NetworkCredential]::new('esp32', $mqttTestPassword)

'{"distancia":42.5,"temperatura":25.3,"umidade":61.2,"movimento":false}' |
    & 'C:\Program Files\mosquitto\mosquitto_pub.exe' -h 127.0.0.1 -p 1883 -u esp32 -P ($mqttTestCredential.Password) -t casa/sensores -q 1 -s

Remove-Variable mqttTestPassword, mqttTestCredential
```

Execute esse teste no computador do broker. O uso de stdin (`-s`) evita problemas com aspas do JSON no PowerShell. Não usamos retain; abra o app e espere a assinatura antes de publicar. Referência: [mosquitto_pub](https://mosquitto.org/man/mosquitto_pub-1.html).

Resultado esperado: **MQTT conectado**, distância **42,5 cm** (a interface pode mostrar ponto decimal), temperatura **25,3 °C**, umidade **61,2%**, nenhum movimento e horário atualizado.

## Solução de problemas

| Sintoma | O que verificar |
| --- | --- |
| Mensagem para configurar o broker | Preencha a URL em `hub/.env.local` e reinicie o Expo. |
| Reconectando / erro de WebSocket | IP, porta 9001, listener WebSocket, firewall e comunicação entre os dispositivos. |
| Conexão recusada / não autorizado | Usuário e senha corretos, arquivo de senhas carregado e broker reiniciado. |
| Assinatura recusada | Permissão de leitura de `hub` na ACL e tópico exato. |
| Conectado, mas sem leituras | ESP32 ou publicador ativo, tópico correto, permissão de escrita e JSON com os quatro campos. |
| Mensagem ignorada | Tipos, limites e nomes dos campos do JSON. |
| Funciona no PC, mas não no celular | Troque `localhost` pelo IPv4 do PC; confira isolamento da rede e firewall. |
| Funciona via HTTP, mas não HTTPS | Configure WSS; o navegador pode bloquear WS em páginas HTTPS. |
| Porta já em uso | Outra instância/serviço Mosquitto pode estar usando 1883 ou 9001. |
| Valores antigos, mesmo conectado | A conexão é com o broker. Ainda não há detecção de ESP32 sem novas mensagens. |
| Mudança do `.env` não aparece | Confira `.env.local`, reinicie o Expo e faça uma recarga completa. |

Para verificar acesso à porta em outro computador da rede:

```powershell
Test-NetConnection -ComputerName 192.168.0.100 -Port 9001
```

Esse comando testa apenas a porta TCP; a publicação acima verifica também autenticação, tópico e entrega ao aplicativo.

## Organização do código

| Arquivo/pasta | Responsabilidade |
| --- | --- |
| [hub/src/config/mqtt.ts](hub/src/config/mqtt.ts) | Leitura e validação das variáveis MQTT |
| [hub/src/services/mqtts.ts](hub/src/services/mqtts.ts) | Conexão, assinatura, reconexão, recebimento e encerramento |
| [hub/src/types/SensorData.ts](hub/src/types/SensorData.ts) | Contrato e validação das leituras |
| [hub/src/services/sensorSimulation.ts](hub/src/services/sensorSimulation.ts) | Geração local de dados fictícios |
| [hub/src/screens/dashboardScreen.tsx](hub/src/screens/dashboardScreen.tsx) | Estado, alternância de modo e dashboard |
| `hub/src/components/` | Cartões de sensores e indicador MQTT |
| `hub/src/app/` | Rotas e layout do Expo Router; `index.tsx` abre o dashboard e `App.tsx` redireciona para `/` |

## Revisão do código — 09/10/2026

Foram revisados os arquivos-fonte, configurações, dependências declaradas, script de reset e documentação versionados. A revisão não substitui testes em dispositivos.

### O que já está implementado

- Conexão MQTT 3.1.1 por WebSocket com client ID aleatório, keepalive de 30 segundos e timeout de conexão de 10 segundos.
- Novas tentativas após falhas de transporte a cada 3 segundos e assinatura QoS 1 a cada conexão. O QoS recebido também depende do publicador.
- Estado conectado somente após confirmação da assinatura.
- Validação de JSON, dos quatro campos e de seus limites; mensagens inválidas não substituem os últimos dados válidos.
- Encerramento da conexão ou do temporizador ao desmontar a tela ou trocar o modo.
- Simulação identificada na tela e separada das leituras reais.

### Pendências e limites encontrados

| Prioridade | Evidência | Próximo passo |
| --- | --- | --- |
| Alta — configuração local | Na revisão, `hub/.env` estava com a senha MQTT vazia. | Preencher a senha de `hub` em `.env.local` para usar o broker autenticado deste guia. |
| Alta — ambiente | Node instalado: 22.12.0; o React Native instalado exige pelo menos 22.13.0 na linha 22. | Atualizar o Node antes de instalar, executar ou gerar builds. |
| Alta — integração | Não há firmware ESP32 nem arquivos de infraestrutura `broker/` versionados. O README anterior citava scripts inexistentes. | Seguir o procedimento manual deste README e validar o firmware; as referências inválidas foram removidas. |
| Média — atualização dos dados | O dashboard marca leituras antigas apenas quando perde a conexão MQTT. | Adicionar timeout de telemetria e disponibilidade do ESP32, por exemplo com Last Will e tópico de status. |
| Média — idade da medição | `SensorData` não tem timestamp ou identificador do dispositivo; o horário exibido é o de recebimento. | Incluir timestamp de medição e identificação; mensagens retidas podem conter dados antigos. |
| Média — retomada da conexão | Não há tratamento explícito de retorno do app ao primeiro plano. Recusas de autenticação não têm retry habilitado por `reconnectOnConnackError`. | Validar retomada em Android/iOS; após corrigir credenciais, reiniciar/recarregar o app. |
| Média — validação automatizada | Não há suíte de testes nem script `test` em `package.json`. | Cobrir mensagens inválidas, assinatura negada, reconexão e troca entre simulação e dados reais. |
| Baixa — manutenção | Hooks de tema não são usados pelo dashboard, que tem cores fixas. Há dependência `typecheck`, mas nenhum script correspondente. | Revisar sobras do template e decidir se haverá tema escuro; a checagem atual usa TypeScript. |
| Baixa — reset | `npm run reset-project` move ou apaga `src` e `scripts` para recriar um app vazio. | Não utilizar esse comando para configurar MQTT ou iniciar o projeto. |

Credenciais públicas do app devem continuar restritas pela ACL. Histórico, alertas, comandos para atuadores e suporte a múltiplos dispositivos ainda não estão implementados.

### Verificações executadas

Dentro de `hub`, ambos concluíram sem erros:

```powershell
node ./node_modules/eslint/bin/eslint.js . --no-cache
node ./node_modules/typescript/bin/tsc --noEmit --incremental false
```

No uso normal, os comandos equivalentes são `npm run lint` e `npx tsc --noEmit`.

Não foram executados build, teste visual em celular ou teste de ponta a ponta com broker/ESP32. O Mosquitto não foi encontrado no caminho padrão nem no PATH desta sessão. Os procedimentos de configuração e publicação acima ainda precisam ser executados no ambiente de integração.
