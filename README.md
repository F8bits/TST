# Math Roadmap

Site estático para acompanhar um roadmap completo de matemática, com progresso salvo no navegador.

## Rodar localmente

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Abra: `http://localhost:8000/index.html`.

## Publicar para acessar de qualquer PC ou celular

### Opção 1 (mais simples): GitHub Pages
1. Suba este repositório para o GitHub.
2. Em **Settings → Pages**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (ou a branch padrão), pasta `/ (root)`
3. Salve.
4. O site ficará disponível em uma URL como:
   - `https://SEU_USUARIO.github.io/NOME_DO_REPO/`

### Opção 2: Netlify (drag & drop)
1. Acesse `https://app.netlify.com/drop`.
2. Arraste a pasta do projeto.
3. Receba uma URL pública imediatamente.

## Observação
- O progresso fica salvo por navegador/dispositivo via `localStorage`.
- Se abrir em outro aparelho, o progresso começa vazio naquele aparelho.
