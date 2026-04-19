# Regression Checklist

## Fluxos críticos

1. Filtro de origem no mapa inteligente
- Abrir `Mapa`.
- Validar que uma rota criada pelo usuário aparece em `Minhas` e não em `Comunidade`.

2. Exclusão de atividade pendente offline
- Criar atividade sem internet.
- Abrir `Meu Histórico`.
- Excluir item pendente e confirmar que ele não reaparece na lista.

3. Baixar/remover rota offline
- Abrir `Detalhes da rota`.
- Tocar em `Baixar rota offline`.
- Fechar e reabrir detalhes: status deve aparecer como disponível offline.
- Tocar em `Remover do offline` e validar remoção.

4. Atualização de versão offline da rota
- Baixar rota.
- Alterar metadados da rota no backend.
- Reabrir `Detalhes da rota`: deve aparecer aviso de versão mais recente.
- Tocar em `Atualizar versão offline`.

5. Exportar rota em GPX
- Em `Detalhes da rota`, tocar em `Exportar GPX`.
- Validar abertura do compartilhamento e arquivo `.gpx`.

6. Reconexão e fila de sincronização
- Com atividades pendentes, voltar a ficar online.
- Validar banner de sincronização e redução do contador de pendências.
