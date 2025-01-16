// Set Mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1IjoicGhhbWR1eXNjIiwiYSI6ImNsbDJ4dHdlNDA1aDgzY3MwMWhya20zZnoifQ.dwL594YjnyhfzWdgkymQaQ";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map", // Specify the container ID
  style: "mapbox://styles/mapbox/streets-v12", // Specify the map style
  center: [144.661, -37.899], // Specify the starting position [lng, lat]
  zoom: 10 // Specify the starting zoom
});

// Define the base URL for the isochrone
const urlBase = "https://api.mapbox.com/isochrone/v1/mapbox/";
let profile = "cycling";
let minutes = 10;

async function updateIsochrone(lngLat) {
  const response = await fetch(
    `${urlBase}${profile}/${lngLat.lng},${lngLat.lat}?contours_minutes=${minutes}&polygons=true&access_token=${mapboxgl.accessToken}`
  );
  const data = await response.json();
  map.getSource("iso").setData(data);
}

params.addEventListener("change", (event) => {
  if (event.target.name === "profile") {
    profile = event.target.value;
  } else if (event.target.name === "duration") {
    minutes = event.target.value;
  }
  updateIsochrones(); // Update both isochrones
});

// Create two markers with different colors and add them to the map
const marker1 = new mapboxgl.Marker({
  draggable: true, // Make the marker draggable
  color: "#FF0000" // Set the marker color to red
})
  .setLngLat([144.661, -37.899])
  .addTo(map);

const marker2 = new mapboxgl.Marker({
  draggable: true, // Make the marker draggable
  color: "#0f0" // Set the marker color to green
})
  .setLngLat([144.967, -37.829])
  .addTo(map);

// Add a drag event to the markers
marker1.on("drag", updateIsochrones);
marker2.on("drag", updateIsochrones);

// Function to fetch POIs within a bounding box
async function fetchPOIs(bbox) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/poi.json?bbox=${bbox.join(
    ","
  )}&access_token=${mapboxgl.accessToken}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.features;
}

// Function to calculate the overlapping area using Turf.js
function calculateOverlap(iso1, iso2) {
  return turf.intersect(iso1, iso2);
}

// Function to add POIs to the map
function addPOIsToMap(pois) {
  pois.forEach((poi) => {
    const marker = new mapboxgl.Marker()
      .setLngLat(poi.geometry.coordinates)
      .setPopup(new mapboxgl.Popup().setText(poi.text))
      .addTo(map);

    // Add click event to copy POI coordinates to clipboard
    marker.getElement().addEventListener("click", () => {
      navigator.clipboard.writeText(
        `${poi.geometry.coordinates[1]}, ${poi.geometry.coordinates[0]}`
      );
      alert("POI coordinates copied to clipboard!");
    });
  });
}

// Update the updateIsochrones function to include POI fetching and displaying
async function updateIsochrones() {
  const lngLat1 = marker1.getLngLat();
  const lngLat2 = marker2.getLngLat();

  const data1 = await fetchIsochrone(lngLat1);
  const data2 = await fetchIsochrone(lngLat2);

  map.getSource("iso1").setData(data1);
  map.getSource("iso2").setData(data2);

  const overlap = calculateOverlap(data1, data2);
  if (overlap) {
    // Highlight the overlapping area
    if (map.getSource("overlap")) {
      map.getSource("overlap").setData(overlap);
    } else {
      map.addSource("overlap", {
        type: "geojson",
        data: overlap
      });
      map.addLayer({
        id: "overlapLayer",
        type: "fill",
        source: "overlap",
        layout: {},
        paint: {
          "fill-color": "#0000FF", // Set the overlap color to blue
          "fill-opacity": 0.5
        }
      });
    }

    const bbox = turf.bbox(overlap);
    const pois = await fetchPOIs(bbox);
    addPOIsToMap(pois);
  }
}

// Define the fetchIsochrone function
async function fetchIsochrone(lngLat) {
  const url = `${urlBase}${profile}/${lngLat.lng},${lngLat.lat}?contours_minutes=${minutes}&polygons=true&access_token=${mapboxgl.accessToken}`;
  const response = await fetch(url);
  return response.json();
}

// Add a load event to the map
map.on("load", () => {
  // Add two new sources to the map
  map.addSource("iso1", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  });

  map.addSource("iso2", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  });

  // Add two new layers to the map with different colors
  map.addLayer(
    {
      id: "isoLayer1",
      type: "fill",
      source: "iso1",
      layout: {},
      paint: {
        "fill-color": "#FF0000", // Set the isochrone color to red
        "fill-opacity": 0.4
      }
    },
    "poi-label"
  );

  map.addLayer(
    {
      id: "isoLayer2",
      type: "fill",
      source: "iso2",
      layout: {},
      paint: {
        "fill-color": "#0f0", // Set the isochrone color to green
        "fill-opacity": 0.4
      }
    },
    "poi-label"
  );

  // Update the isochrones for both markers
  updateIsochrones();
});
