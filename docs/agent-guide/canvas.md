# Canvas

## Canvas colors

To check the default canvas color, create a rectangle and a text box without
changing the swatch. The rectangle should have a light neutral fill and a dark
outline; the text should be dark and visible. Also check the neutral swatch after
selecting another color. Neutral colors use an OKLCH `none` hue, which must render
as gray rather than transparent.

## Canvas link paste

Pasting a supported routed Macro app link onto the canvas creates a text
node with an entity mention, as legacy links do. Routed links retain compatible
block targets, but not workspace paths or pane-local search state; unsupported
links remain text.

## Copying and saving images

Select exactly one image to show **Copy image** and **Save image** in both the
context menu and the Canvas inspector. They use the original image, without
canvas transforms or styling. Copy writes image data where supported; the shared
image action can fall back to copying its URL. Save downloads the source format
on desktop and uses the native share sheet on supported mobile devices.
Controls are disabled while resolving the image source or running an action.
Check an uploaded image and a workspace image, and confirm both actions disappear
for multiple selections, groups, videos, and non-image shapes.

## Multiplayer canvas

Open the same canvas as two editors and a viewer. Create/move a shape in one
editor and style it in the other; all three should converge. Undo the move and
confirm the remote styling survives. Check colored cursors, dashed remote
selections and live drag/drawing ghosts, including camera pan/zoom. Text, media,
connectors and document cards use bounds-only ghosts; connector endpoint drafts
are not broadcast. On touch, check selection and gesture awareness without hover.

Disconnect an initialized editor, edit, reopen from its local cache, then reconnect.
The unsent edits must survive and reach the other peers. Disconnecting removes
remote overlays locally; absent peers expire after ten seconds. If the first
connection or local storage fails, the original JSON opens read-only with Retry.
If a live session cannot save locally, keep it open and use Retry saving; the
live scene stays mounted until its buffered edits are persisted. Changing
accounts invalidates the old connection; refreshed view/comment grants disable
canvas edits.
A viewer may wait on the original JSON until the first editor initializes the room.

Downloads export the live scene, and Copy duplicates the shared room plus its
original JSON. Reload older open canvas tabs before collaborating: the previous
whole-file editor does not participate in shared state. Editing the same text
item concurrently chooses one completed content string; characters do not merge.
