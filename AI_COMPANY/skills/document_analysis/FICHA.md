# SKILL_DOCUMENT_ANALYSIS v1.0

> Gerado de `skill.json`. Edite o JSON, não este arquivo.

**PURPOSE:** Transformar o texto de uma ficha ou documento em campos estruturados, apontando o que falta, o que é inválido, o que se contradiz e o que é ambíguo.

**INPUT:** Texto com linhas 'campo: valor' (ou objeto {campo: valor}) entregue na tarefa. Campos reconhecidos: nome, cpf, rg, nascimento, telefone, email, endereço, categoria, serviço, valor total, desconto, entrada, forma da entrada, parcelas, primeiro vencimento.

## PROCESS
- Ler cada linha 'campo: valor' e identificar o campo pelo nome ou sinônimo.
- Detectar campo repetido com valores diferentes (conflito) sem escolher um deles.
- Validar formato: CPF com dígitos verificadores, datas existentes, valores em reais, telefone com DDD, e-mail.
- Comparar categoria, serviço e forma de pagamento com as listas oficiais; valor que bate com mais de uma opção é ambíguo.
- Listar os campos obrigatórios ausentes (nome, cpf, categoria, serviço, valor total).
- Registrar de qual linha veio cada dado (fontes).

**OUTPUT:** { ficha, faltando[], invalidos[], conflitos[], ambiguos[], avisos[], desconhecidos[], fontes[] }

## REQUIREMENTS
- Texto legível com um campo por linha.
- Nenhuma ferramenta externa.

## LIMITATIONS
- Não faz OCR: documentos em imagem precisam ser transcritos antes.
- Não completa dados ausentes nem corrige erros sozinha.
- Reconhece só os campos e sinônimos listados.

## ERROR_HANDLING
- Entrada vazia ou sem linhas reconhecíveis → todos os obrigatórios aparecem em 'faltando'.
- Campo inválido vai para 'invalidos' com o motivo; nunca é descartado em silêncio.

## EXAMPLES
- entrada: `"Nome: Maria Souza\nCPF: 529.982.247-25\nCategoria: B\nServiço: Primeira habilitação\nValor total: 2.500,00"` → saída: ficha completa, faltando = []
- entrada: `"Nome: João\nCPF: 111.111.111-11"` → saída: invalidos: nome (sem sobrenome), cpf; faltando: categoria, servico, valor_total

## USED_BY
captador, auditor, atendimento

## CHANGELOG
- v1.0 (2026-10-15): Versão inicial.
