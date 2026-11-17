# Live: IA in local with runonweb

A photo from the store passes through three models running in the browser with [runonweb](https://runonweb.ai): one removes the background, another describes it in English and another reads the description aloud. No server, no key API and no photo exits the device. The code is in `foto.js` and is seen in `/directo/runonweb` from the workshop website (`pnpm dev` at root).

**Live code is not written: it is decommented.** Selects the lines of each `PASO N` and presses `Cmd + /`. The page is reloaded by itself when saving.

| Step, I'm sorry. | Module | What do you see? |
| --- | --- | --- |
| 1 | `runonweb/remove-bg` | The bottomless product (transparent PNG) |
| 2 | `runonweb/caption` | The description of the photo, written in English |
| 3 | `runonweb/tts` | The description read aloud |

All three models weigh about 800 MB in total. **Open them once before the chat** (discommission the three steps, tap **All** and start again): they stay in the browser cache and live load in seconds.

To start over: `git checkout -- foto.js`.
