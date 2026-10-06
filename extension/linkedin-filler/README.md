# LinkedIn Profile Filler

A Chrome extension that puts your approved profile text into LinkedIn's own edit forms, one step at a time. You check every form and press Save yourself. The extension never presses Save, never deletes anything and never sends your text anywhere.

## Install, about two minutes

1. Unzip the download. You get a folder called `LinkedIn_Profile_Filler`.
2. In Chrome open `chrome://extensions` and turn on Developer mode, top right.
3. Press Load unpacked and choose the `LinkedIn_Profile_Filler` folder.
4. Pin the extension from the puzzle piece icon, then click it. The side panel opens.

Works in Chrome 116 or later, and in Edge and Brave, which use the same engine.

## Use

1. Sign in to LinkedIn in the same browser window.
2. For each step in the panel press Open. The right LinkedIn page opens in your tab.
3. Open the edit form the hint names, for example the pencil next to a job.
4. Press Fill. The text goes in. Read it, then press Save on LinkedIn.
5. Tick done. Progress is kept in this browser until you remove the extension.

If Fill reports a problem, press Copy and paste the text by hand. Every step has a See the text preview.

## What keeps it safe

- It only runs on `https://www.linkedin.com/`, and only when you press a button.
- Before typing, it checks the open form belongs to the right job, project or school. If not, it stops and changes nothing.
- It refuses text longer than the field allows instead of cutting it.
- Your text lives in `data.js` inside this folder. The extension makes no network requests.

## When LinkedIn changes its forms

Press Report form layout at the bottom of the panel. It copies the labels and field types of the open form, never what is typed in them. Send that report with a description of the step that failed.

## Remove

Open `chrome://extensions` and press Remove. That also deletes the saved progress.
