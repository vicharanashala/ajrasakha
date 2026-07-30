const fs = require('fs');
const topojson = require('topojson-client');

const tsPath = "d:\\programm3d\\ajrasakha\\frontend\\src\\features\\home-dashboard\\components\\indiaTopoJson.ts";
const content = fs.readFileSync(tsPath, 'utf8');

const rawJson = content.replace("export const indiaTopoJson = ", "").replace(";\nexport default indiaTopoJson;", "");
const topo = JSON.parse(rawJson);

console.log("TopoJSON type:", topo.type);
console.log("TopoJSON objects:", Object.keys(topo.objects));

const featureName = Object.keys(topo.objects)[0];
const geojson = topojson.feature(topo, topo.objects[featureName]);

console.log(`Successfully extracted ${geojson.features.length} state features from official TopoJSON dataset!`);

for (let i = 0; i < Math.min(5, geojson.features.length); i++) {
  console.log(`Feature ${i}:`, geojson.features[i].properties);
}
