Static Pro Library assets live here.

Add `.mp4` files to this folder, then run:

```bash
npm run pro-swings:generate
```

The generator writes `lib/data/pro-swings.generated.ts`. `npm run dev` and `npm run build`
run the generator automatically.

Generated entries use filename defaults:

- `videoUrl`: `/pro-swings/<id>.mp4`
- `thumbnailUrl`: matching `/pro-swings/<id>.jpg`, `.png`, `.jpeg`, or `.webp` when present;
  otherwise `/file.svg`
- player/title from the filename
- club `Unknown`
- view angle `face-on`
- handedness `right`
- fps `30`
- duration `0`
- tags `[]`

Metadata can be edited in the Pro Library UI. Those edits are local browser overrides
and do not rewrite files in this folder.

Personal user uploads are not stored here. They are imported through the app UI and persisted in IndexedDB.
