import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../content/gallery.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
if (data.photos[0]?.title !== "AF1CvrR") {
  throw new Error(
    "Curation is already complete. Use the admin to edit titles.",
  );
}
const descriptions = {
  af1cvrr: [
    "aviation",
    "Air Force One",
    "Air Force One climbing against a clear blue sky.",
  ],
  "mtl-x": [
    "landscape",
    "Montréal after dark",
    "The illuminated Montréal skyline reflected in the waterfront at night.",
  ],
  "ac-x": [
    "aviation",
    "Into the clouds",
    "An Air Canada aircraft banking above the clouds.",
  ],
  "jfk-x": [
    "landscape",
    "City of lights",
    "A suspension bridge and the New York skyline illuminated at night.",
  ],
  "qr-x": [
    "aviation",
    "Ready for departure",
    "A Qatar Airways aircraft on the runway under a pink evening sky.",
  ],
  "yyc-wsj787-2": [
    "aviation",
    "Above the city",
    "A WestJet aircraft taking off in front of the city skyline.",
  ],
  nf436: [
    "landscape",
    "Into the mist",
    "A sightseeing boat approaching the mist below Niagara Falls.",
  ],
  "cnt-626r": [
    "landscape",
    "Toronto, framed",
    "The CN Tower framed by trees and city architecture.",
  ],
  sa777: [
    "aviation",
    "Blue skies ahead",
    "A Saudia airliner ascending across a blue sky.",
  ],
  "c-fvlx-snow-1-2": [
    "aviation",
    "Winter operations",
    "An Air Canada aircraft on a snowy apron with drifting snow behind it.",
  ],
  "yvr-boat": [
    "landscape",
    "Still water",
    "A row of waterfront boathouses reflected in still water.",
  ],
  "bdr-jn1-web": [
    "wildlife",
    "At the water’s edge",
    "A heron resting on a rock amid rushing river rapids.",
  ],
  nf736: [
    "landscape",
    "A view from above",
    "An aerial view of streets and architecture near Niagara Falls.",
  ],
  "oaci-9917": [
    "landscape",
    "Quiet architecture",
    "A symmetrical interior with glass, stone and illuminated architectural details.",
  ],
  cmp: [
    "landscape",
    "Across the river",
    "A long bridge stretching over calm water in the evening light.",
  ],
  "q400-excu-pt": [
    "aviation",
    "On the apron",
    "A regional turboprop aircraft and its propeller photographed from above.",
  ],
  "aa-erj-plt": [
    "aviation",
    "Before the flight",
    "The cockpit and nose of an American Eagle regional aircraft at the gate.",
  ],
  sd515: [
    "landscape",
    "City in motion",
    "A busy city street beneath a blue sky.",
  ],
  "yqb-1": [
    "landscape",
    "Evening on the waterfront",
    "A ferry and riverside buildings after sunset.",
  ],
  "bdr-jl14-8r": [
    "wildlife",
    "Wings unfolding",
    "A heron opening its wings among reeds and grass.",
  ],
  "en-nsrt-2ehc": [
    "motorsport",
    "Lines in motion",
    "The rear of a white sports car photographed on a city street.",
  ],
  "ts-fin103": [
    "aviation",
    "After hours",
    "An Air Transat aircraft parked on an illuminated airport apron at night.",
  ],
  thunderbirdab: [
    "aviation",
    "Precision in flight",
    "A Thunderbird jet performing a steep banking manoeuvre.",
  ],
  "81-0041-wm": [
    "aviation",
    "Beyond the clouds",
    "A fighter jet climbing through the pale sky.",
  ],
  f22r: [
    "aviation",
    "A moment of power",
    "An F-22 fighter jet in flight under soft evening light.",
  ],
  f1rk: [
    "motorsport",
    "Flat out",
    "A red Formula One car racing past a green and yellow trackside wall.",
  ],
  ospreyk: [
    "wildlife",
    "On the wing",
    "An osprey in flight with its wings outstretched against a blue sky.",
  ],
  "jb-jfk": [
    "aviation",
    "A skyline departure",
    "A JetBlue airliner approaching the runway in front of the city skyline.",
  ],
  "yyz-dt-x": [
    "landscape",
    "Above Toronto",
    "An aerial view of Toronto skyscrapers and the CN Tower through clouds.",
  ],
  "slr-ecpre": [
    "landscape",
    "A fleeting eclipse",
    "A total solar eclipse with a thin glowing corona against a black sky.",
  ],
  xfemgjn75348: [
    "portrait",
    "Afternoon light",
    "A portrait in a black dress beside a stone balcony in warm light.",
  ],
  xfemgpsx: [
    "portrait",
    "In conversation",
    "A relaxed outdoor portrait in a light jacket.",
  ],
  "ptr-sep29x": [
    "portrait",
    "A city afternoon",
    "A street portrait with softly blurred architecture in the background.",
  ],
  "ptr-oct20-4": [
    "portrait",
    "Autumn warmth",
    "An outdoor portrait with autumn foliage and yellow flowers.",
  ],
  "ptr-o5-flr-dxf": [
    "portrait",
    "Among the flowers",
    "A portrait beside vivid pink flowers and climbing greenery.",
  ],
  "ptr-oct20-1x": [
    "portrait",
    "A quiet chapter",
    "An outdoor portrait reading a book beside autumn foliage.",
  ],
  "vff-ptr-sg24": [
    "portrait",
    "Confidence, captured",
    "A professional portrait in a suit outside a building.",
  ],
};
data.categories = [
  { id: "aviation", label: "Aviation" },
  { id: "landscape", label: "Landscapes" },
  { id: "portrait", label: "Portraits" },
  { id: "wildlife", label: "Wildlife" },
  { id: "motorsport", label: "Motorsport" },
];
for (const photo of data.photos) {
  const item = descriptions[photo.id];
  if (!item) throw new Error(`Uncurated ${photo.id}`);
  [photo.category, photo.title, photo.alt] = item;
}
await writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(
  "Curated titles, alternative text and categories from the original photographs.",
);
