# Tutorial de testes

Este guia mostra como testar a interface no navegador e no celular com sensores simulados. Para testar a comunicação MQTT, veja também a [configuração do broker no README](README.md#2-criar-os-usuários-do-mosquitto).

## 1. Preparar o projeto

Use Node **22.13 ou superior na linha 22**, ou **24.3 ou superior na linha 24**. No PowerShell, abra a raiz do repositório e execute:

```powershell
node --version
cd hub
npm ci
```

Se já estiver dentro de `hub`, não execute `cd hub` novamente. Se as dependências já estiverem instaladas, pode pular `npm ci`.

**Todos os comandos seguintes devem ser executados dentro de `hub`.**

Para a simulação, não é necessário configurar `.env`, instalar Mosquitto ou conectar o ESP32. Os comandos de teste preservam as configurações MQTT existentes.

## 2. Testar no navegador do computador

```powershell
npm run test:ui
```

Aguarde a primeira compilação. O navegador deve abrir automaticamente; caso não abra, copie o endereço HTTP informado no terminal, normalmente `http://localhost:8081`.

A tela deve mostrar **Simulação ativa** e valores iniciais de distância **50,0 cm**, temperatura **25,0 °C**, umidade **75,0%** e **Nenhum movimento**. A interface usa ponto como separador decimal. As leituras começam a mudar a cada dois segundos; por isso, os valores podem já ter mudado quando você abrir a tela.

Mantenha o terminal aberto durante o teste.

## 3. Testar no celular com Expo Go

### Iniciar no computador

Se quiser reutilizar o terminal do teste web, encerre o servidor com **Ctrl+C**. Depois execute:

```powershell
npm run test:mobile
```

O Expo exibirá um QR code e um endereço no formato `exp://IP_DO_COMPUTADOR:PORTA`. Se oferecer outra porta porque a padrão está ocupada, aceite e use o endereço novo.

O computador pode estar conectado por cabo Ethernet e o celular por Wi-Fi, desde que ambos consigam se comunicar na mesma rede local. Evite a rede de convidados.

### Android

1. Instale o **Expo Go** compatível com o **SDK 57**. Consulte [Expo Go](https://expo.dev/go).
2. Conecte o celular ao Wi-Fi da rede do computador.
3. Abra o Expo Go e use a opção de ler QR code.
4. Escaneie o QR code exibido no terminal e aguarde carregar.
5. Confira se aparece **Simulação ativa**.

Se sua versão do Expo Go oferecer entrada manual de endereço, você também pode informar a URL `exp://...` exibida pelo terminal.

### iPhone

1. Instale o Expo Go compatível com o SDK 57.
2. No computador, entre na sua conta Expo:

   ```powershell
   npx expo login
   ```

3. Entre no Expo Go com a **mesma conta** usada no computador.
4. Inicie ou reinicie `npm run test:mobile`.
5. Use a câmera do iPhone para ler o QR code e abra o link no Expo Go.
6. Permita acesso à rede local, caso o iOS solicite.

A exigência de usar a mesma conta no iPhone está documentada no [guia de desenvolvimento do Expo](https://docs.expo.dev/get-started/start-developing/).

### Escolher uma porta

Para definir a porta explicitamente, use o inicializador diretamente. Isso também evita problemas de encaminhamento de argumentos pelo npm no PowerShell:

```powershell
node ./scripts/start-simulation.cjs --go --lan --port 8083
```

Exemplo ilustrativo de endereço: `exp://192.168.0.100:8083`. **Use sempre o IP e a porta mostrados na sua sessão**, pois podem mudar. `localhost` no celular aponta para o próprio celular.

O servidor de desenvolvimento usa a porta do Expo, geralmente 8081. As portas MQTT 1883 e 9001 não são necessárias para testar a simulação.

## 4. Roteiro para conferir a interface

Faça os testes abaixo no navegador e no celular, mantendo o aplicativo em primeiro plano:

| Ação | Resultado esperado |
| --- | --- |
| Abrir pelo comando de teste | Aparece **Simulação ativa** e os cartões já têm valores. |
| Esperar pelo menos 10 segundos | Distância, temperatura, umidade e horário mudam a cada dois segundos aproximadamente. |
| Observar movimento por pelo menos 12 segundos | Alterna entre **Nenhum movimento** e **Movimento detectado**, aproximadamente a cada seis segundos. |
| Rolar a tela no celular | Todos os cartões e o horário no rodapé ficam acessíveis, sem texto cortado. |
| Tocar em **Usar dados reais**, sem broker configurado | A simulação para, as leituras são limpas e a tela informa espera ou erro de conexão. |
| Tocar em **Usar simulação** novamente | Voltam os dados fictícios; erros MQTT deixam de aparecer nesse modo. |
| Recarregar a página ou o app pela opção Reload do Expo Go | A sessão de teste volta ao modo simulado e reinicia os valores. |
| Mandar o app para segundo plano e voltar | Conferir se as atualizações retomam; o sistema pode suspender temporizadores enquanto o app está em segundo plano. |

Os dados são gerados localmente em cada instância. O navegador e o celular podem mostrar valores diferentes porque iniciaram a simulação em momentos diferentes.

A simulação não testa Wi-Fi do ESP32, autenticação MQTT, permissões do tópico nem leitura dos sensores físicos.

## 5. Testar MQTT quando o broker estiver pronto

1. Siga a [configuração do Mosquitto e do aplicativo](README.md#2-criar-os-usuários-do-mosquitto).
2. No celular, a URL MQTT deve usar o IP do computador e a porta WebSocket, por exemplo `ws://192.168.0.100:9001`.
3. Reinicie o Expo se tiver alterado variáveis de ambiente.
4. Na interface, toque em **Usar dados reais**.
5. Espere **MQTT conectado**.
6. Execute o comando de [publicação real pelo broker](README.md#publicação-real-pelo-broker) em outro terminal no computador.
7. Confira distância **42,5 cm**, temperatura **25,3 °C**, umidade **61,2%**, nenhum movimento e horário atualizado.

Para verificar a reconexão em um broker dedicado ao seu teste, encerre-o com Ctrl+C, observe a indicação de conexão indisponível e inicie-o novamente. Após reconectar, publique uma nova leitura: a publicação de exemplo não usa retain e não será reenviada automaticamente.

**MQTT conectado** confirma a conexão com o broker, não a disponibilidade do ESP32. Se apenas o ESP32 parar de enviar mensagens, ainda não há aviso automático de telemetria antiga.

## 6. Resolver problemas comuns

| Problema | Como resolver |
| --- | --- |
| Comando npm não encontrado ou erro de versão do Node | Instale uma versão compatível de Node e abra um novo terminal. |
| Script `test:ui` ou `test:mobile` não encontrado | Confira se o terminal está na pasta `hub`. |
| Porta já ocupada | Aceite a porta alternativa sugerida ou escolha uma com o comando da seção 3. |
| Primeiro carregamento demora | Aguarde a compilação no terminal; os comandos de teste limpam o cache do Metro ao iniciar. |
| Abriu em modo real | Confirme que iniciou com `test:ui` ou `test:mobile` e abriu a porta dessa sessão. |
| Expo Go informa SDK incompatível | Use um cliente compatível com SDK 57; se indisponível para seu dispositivo, será necessário um development build ou testar pelo navegador. |
| Celular não conecta | Confira IP, porta, mesma rede, VPN, isolamento entre dispositivos e permissão do Node.js no firewall para a rede autorizada. |
| iPhone informa erro de conta | Entre na mesma conta no Expo CLI e no Expo Go e reinicie a sessão. |
| iPhone não acessa a rede local | Confira a permissão de rede local do Expo Go nos Ajustes. |
| QR code não abre | Use a câmera no iPhone ou o leitor do Expo Go no Android; confirme que o código é da sessão atual. |
| Os valores não mudam | Deixe o app em primeiro plano, confirme **Simulação ativa** e recarregue o app. |
| Erro MQTT ao tocar em **Usar dados reais** | Sem broker acessível isso é esperado; volte à simulação ou configure o broker. |

Se a rede impedir conexões locais, uma alternativa é iniciar por túnel:

```powershell
node ./scripts/start-simulation.cjs --go --tunnel
```

O Expo pode solicitar a instalação do componente de túnel. Esse modo precisa de internet e pode ser mais lento. Ele permite carregar o app, mas **não torna um broker MQTT local acessível ao celular**. Referência: [conexão por túnel no Expo](https://docs.expo.dev/get-started/start-developing/).

## 7. Encerrar e voltar ao uso normal

Encerre o servidor de teste com **Ctrl+C**. Para iniciar normalmente:

```powershell
npm start
```

Ou, para o navegador com dados reais:

```powershell
npm run web
```

Os comandos de teste habilitam a simulação somente no processo iniciado por eles. Os comandos normais iniciam no modo real, desde que você não tenha configurado manualmente `EXPO_PUBLIC_SENSOR_MODE=simulation` no ambiente.

Não use `npm run reset-project` para encerrar testes: ele move ou apaga o código e recria o projeto inicial.

## 8. Conferir o código

```powershell
npm run lint
npx tsc --noEmit
```

Esses comandos verificam estilo e tipos. `test:ui` e `test:mobile` iniciam ambientes para **testes manuais**; não são suítes automatizadas.

Na preparação do ambiente, passaram lint, TypeScript, compilação web e geração do bundle Android. A página web respondeu HTTP 200 com a simulação ativa. A validação visual em aparelho físico e a integração MQTT/ESP32 ainda precisam ser realizadas seguindo este roteiro.

Ao registrar um problema, anote dispositivo, sistema, comando usado, passo que falhou e mensagem exibida. Não inclua senhas.
