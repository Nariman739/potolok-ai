# Bake-off: AI image-gen providers for ceiling visualization

Прогоняет одно тестовое фото через все доступные image-gen API, сохраняет результаты в `./out/`.

## Запуск

```bash
cd ~/projects/potolok-ai-vision
node --env-file=.env.local scripts/bake-off/run.mjs <path-to-photo> [--provider nano-banana|flux-fill|all]
```

Примеры:
```bash
# Только Nano Banana (нужен OPENROUTER_API_KEY)
node --env-file=.env.local scripts/bake-off/run.mjs ~/Downloads/room.jpg --provider nano-banana

# Все доступные (FAL добавится автоматически если есть FAL_KEY)
node --env-file=.env.local scripts/bake-off/run.mjs ~/Downloads/room.jpg --provider all
```

## Что меряем

- **Качество**: сохранилась ли композиция (стены, окна, мебель не сломались), реалистичен ли потолок
- **Время**: от отправки до получения результата (сек)
- **Цена**: фактическая стоимость с API
- **Артефакты**: швы по краям, кривые споты, искажение перспективы

## Результаты сохраняются в

- `out/<timestamp>_<provider>.jpg` — итоговое изображение
- `out/<timestamp>_<provider>.json` — метаданные (промпт, время, размер, ошибки)
