# Casa inteligente — aplicativo Expo

Para HiveMQ Cloud ou HiveMQ gratuito local com Docker e firmware ESP32, siga [HIVEMQ.md](../HIVEMQ.md).

O guia completo está no [README da raiz](../README.md), incluindo:

- requisitos e execução do aplicativo;
- configuração do Mosquitto no Windows com TCP, WebSocket, usuários e ACL;
- variáveis de ambiente MQTT;
- contrato JSON e configuração do ESP32;
- simulação, teste de publicação e solução de problemas;
- revisão do código, pendências e verificações realizadas.

Execute os comandos de instalação e do Expo nesta pasta (`hub`). O exemplo de ambiente está em [.env.example](.env.example).

## Tutorial de testes

Consulte [TESTES.md](../TESTES.md) para testar no navegador e no celular, conferir a simulação e resolver erros de conexão.

Nesta pasta:

```powershell
npm run test:ui
```

Para o celular:

```powershell
npm run test:mobile
```
