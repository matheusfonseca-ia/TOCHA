# Inventário ManyChat (Instagram) x Falow

Levantamento rápido (WebSearch/WebFetch, sem copiar textos do ManyChat) das features de
automação do ManyChat para Instagram, cruzadas com o que o Falow já tem ou vai ganhar nesta
rodada. Fontes: help.manychat.com (artigos de trigger), developers.facebook.com (webhook
payloads), ver relatório final do agente para os links usados.

## Gatilhos (triggers)

| Feature ManyChat | O que faz | Status no Falow |
|---|---|---|
| Palavra-chave em DM | Inicia fluxo quando a DM contém um termo | Já existe (`trigger` source `dm`) |
| Qualquer mensagem | Inicia fluxo em qualquer DM | Já existe (`anyMessage`) |
| Comentário em post/Reel | Responde comentário + DM com botão | Já existe (rule `trigger_type: comment`, nó `automation`) |
| Story Reply | Pessoa responde a um story da conta | Implemento agora (`TriggerSource: "storyReply"`) |
| Story Mention | Pessoa marca a conta em um story dela | Implemento agora (`TriggerSource: "storyMention"`) |
| Ref URL (ig.me/m/user?ref=code) | Abre a DM a partir de um link/QR com código | Implemento agora (`TriggerSource: "refLink"`, campo `refCode`) |
| Live Comments | Comentários durante uma live | Fica para depois (API de live é separada, fora do escopo) |
| Ads (click to Messenger/Instagram) | Anúncio abre a conversa com referral | Fica para depois (mesmo mecanismo de `referral`, mas ads tem `source` diferente; não pedido nesta rodada) |
| Automação temporária (expira) | Automação para de rodar após data/tempo | Outro agente (Opus A) |

## Ações / blocos (nós do canvas)

| Feature ManyChat | O que faz | Status no Falow |
|---|---|---|
| Send Message / Buttons / Quick Replies | Já cobertos | Já existe |
| Smart Delay / Delay | Já existe (`delay`) | Já existe |
| User Input (coleta de dado) | Pergunta e valida um campo | Outro agente (Opus B) |
| Condition | Ramifica por campo/tag | Outro agente (Opus B) |
| Set Field / Add Tag | Grava dado ou tag no contato | Outro agente (Opus B) |
| Random / A-B Split | Sorteia entre 2 a 5 caminhos por peso | Implemento agora (`randomizer`) |
| Go to Flow | Encerra o fluxo atual e inicia outro | Implemento agora (`goToSequence`) |
| Pause Automation | Contato para de receber automações por X horas | Implemento agora (`stopAutomation`, usa `conversations`, não `contacts`) |
| Notify Admin | Manda alerta interno (e-mail/Slack) | Fica para depois (não pedido nesta rodada, exige integração externa) |
| Variantes de resposta em comentário | Sorteia entre várias respostas | Outro agente (Sonnet C) |
| Expiração de automação/workflow | Idem acima | Outro agente (Opus A) |

## Resumo (5 linhas)

O ManyChat cobre gatilhos por DM/comentário (já no Falow), gatilhos por story (reply e
mention) e por link de referência (ig.me?ref=), além de ações utilitárias como
randomizador de caminho, ir para outro fluxo e pausar automação por contato. Este agente
implementa os 3 gatilhos novos e os 3 nós utilitários listados acima; coleta de dados,
condição, campos/tags, variantes de comentário e expiração ficam com os outros 3 agentes
da rodada. Live Comments, Ads referral e "Notify Admin" ficam fora de escopo por exigirem
APIs/integrações que não foram pedidas agora.
