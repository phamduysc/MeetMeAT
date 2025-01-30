// Set Mapbox access token
mapboxgl.accessToken = "pk.eyJ1IjoicGhhbWR1eXNjIiwiYSI6ImNpd3NwaWU1bDAwMzgyb2xxMDV3cDdkZHEifQ.azpuFuQ3KlBc99cXQ-e9pg";

// Initialize the map
const map = new mapboxgl.Map({
    container: "map", // Specify the container ID
    style: "mapbox://styles/mapbox/streets-v12", // Specify the map style
    center: [144.661, -37.899], // Specify the starting position [lng, lat]
    zoom: 12 // Specify the starting zoom
});

// Add geolocate control to the map.
const geolocateControl = new mapboxgl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true
    },
});
map.addControl(geolocateControl);

// Get the slider and its value display
const durationSlider = document.getElementById("duration-slider");
const sliderValue = document.getElementById("slider-value");

// Update the slider value display in real-time
durationSlider.addEventListener("input", (e) => {
    sliderValue.textContent = `${e.target.value} min`; // Update the displayed value
    minutes = e.target.value; // Update the duration variable
    updateIsochrones(); // Update isochrones in real-time
});

// Get the reset button
const resetButton = document.getElementById("btn-reset");

// Add event listener to reset button
resetButton.addEventListener("click", () => {
    // Trigger geolocation to get the user's current position
    geolocateControl.trigger();

    // Reset the slider value
    durationSlider.value = 10;
    sliderValue.textContent = "10 min";
    minutes = 10;

    // Remove all markers from the map
    markers.forEach(marker => marker.remove());
    markers = []; // Clear the markers array
    // Remove all search containers
    const searchContainers = document.querySelectorAll(".search-container");
    searchContainers.forEach(container => container.remove());
    // Update isochrones
    updateIsochrones();
});

// Define the base URL for the isochrone
const urlBase = "https://api.mapbox.com/isochrone/v1/mapbox/";
let profile = "cycling"; // Default transport method
let minutes = 10; // Default duration

// Create an array to store markers
let markers = [];

// Function to update isochrones for all markers
async function updateIsochrones() {
    // Clear existing isochrone layers
    if (map.getSource("iso")) {
        map.removeLayer("isoLayer");
        map.removeSource("iso");
    }
    if (map.getSource("overlap")) {
        map.removeLayer("overlapLayer");
        map.removeSource("overlap");
    }
    if (map.getSource("pois")) {
        map.removeLayer("poisLayer");
        map.removeSource("pois");
    }

    // Fetch isochrones for all markers
    const isochrones = await Promise.all(
        markers.map((marker) => fetchIsochrone(marker.getLngLat()))
    );

    // Combine all isochrone features into a single FeatureCollection
    const combinedFeatures = isochrones.flatMap((data, index) => {
        // Assign a color to each feature based on the marker's color
        const markerColor = markers[index]._color;
        data.features.forEach((feature) => {
            feature.properties.color = markerColor;
        });
        return data.features;
    });

    // Add the combined isochrone data to the map
    map.addSource("iso", {
        type: "geojson",
        data: {
            type: "FeatureCollection",
            features: combinedFeatures
        }
    });

    // Add the isochrone layer to the map
    map.addLayer(
        {
            id: "isoLayer",
            type: "fill",
            source: "iso",
            layout: {},
            paint: {
                "fill-color": ["get", "color"], // Use the color property from the feature
                "fill-opacity": 0.4
            }
        },
        "poi-label" // Place the layer below POI labels
    );

    // Calculate and highlight overlapping zones
    const overlappingFeatures = highlightOverlappingZones(combinedFeatures);
}

// Function to show POIs (restaurants, cafes) within the overlapping zones
function showPOIsWithinOverlap(overlappingFeatures) {
    // Combine all overlapping zones into a single polygon
    const combinedOverlap = turf.combine(
        turf.featureCollection(overlappingFeatures)
    );

    // Convert combinedOverlap to a valid turf.js polygon if needed
    const combinedPolygon = combinedOverlap.features[0];

    // Query Mapbox for POIs within the overlapping zones
    const poiFeatures = map.querySourceFeatures("composite", {
        sourceLayer: "poi_label", // Mapbox POI layer
        filter: [
            "all",
            ["in", "class", "restaurant", "cafe"], // Filter for restaurants and cafes
            ["within", combinedPolygon] // Filter for POIs within the overlapping zones
        ]
    });

    // Add a marker for each POI
    poiFeatures.forEach((poi) => {
        const marker = new mapboxgl.Marker({
            color: "#FF0000" // Red color for POI markers
        })
            .setLngLat(poi.geometry.coordinates)
            .addTo(map);

        // Create a popup window with a link to Google Maps navigation
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <h3>${poi.properties.name}</h3>
            <p>${poi.properties.address}</p>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${poi.geometry.coordinates[1]},${poi.geometry.coordinates[0]}" target="_blank">Navigate with Google Maps</a>
        `);

        // Add the popup to the marker
        marker.setPopup(popup);

        // Add click event listener to the marker to show the popup
        marker.getElement().addEventListener("click", () => {
            popup.addTo(map);
        });
    });
}

// Function to export isochrones as KML
function exportIsochronesToKML() {
    // Get the isochrone data from the map source
    const isochroneSource = map.getSource("iso");
    if (!isochroneSource) {
        alert("No isochrone data available to export.");
        return;
    }

    // Convert the isochrone data to KML using the tokml library
    const kml = tokml(isochroneSource._data);

    // Create a download linkbtn-add-marker for the KML file
    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "isochrones.kml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function to fetch isochrone data
async function fetchIsochrone(lngLat) {
    const response = await fetch(
        `${urlBase}${profile}/${lngLat.lng},${lngLat.lat}?contours_minutes=${minutes}&polygons=true&access_token=${mapboxgl.accessToken}`
    );
    return response.json();
}

// Add event listeners for transport method and duration changes
document.getElementById("params").addEventListener("change", (event) => {
    if (event.target.name === "profile") {
        profile = event.target.value; // Update transport method
    } else if (event.target.name === "duration") {
        minutes = event.target.value; // Update duration
    }
    updateIsochrones(); // Update isochrones
});

// Function to add a new marker
function addMarker(lngLat, color = "#FF0000") {
    const marker = new mapboxgl.Marker({
        draggable: true,
        color: color
    })
        .setLngLat(lngLat)
        .addTo(map);

    // Store the color in the marker object
    marker._color = color;

    // Create a container for the search bar
    const searchContainer = document.createElement("div");
    searchContainer.className = "search-container";
    searchContainer.style.display = "none"; // Hide the search bar initially
    document.body.appendChild(searchContainer);

    // Add a geocoder for the new marker
    const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl: mapboxgl,
        marker: false, // Disable the default marker
        placeholder: `Grab this mate`
    });

    // Add the geocoder to the search container
    searchContainer.appendChild(geocoder.onAdd(map));

    // Position the search container near the marker
    const updateSearchPosition = () => {
        const markerPos = map.project(marker.getLngLat());
        searchContainer.style.position = "absolute";
        searchContainer.style.left = `${markerPos.x}px`;
        searchContainer.style.top = `${markerPos.y}px`;
    };

    // Update the search bar position when the marker is dragged or the map is moved
    marker.on("drag", () => {
        updateSearchPosition();
        updateIsochrones();
    });
    map.on("move", updateSearchPosition);

    // Toggle the search bar visibility when the marker is clicked
    marker.getElement().addEventListener("click", () => {
        if (searchContainer.style.display === "none") {
            searchContainer.style.display = "block";
            updateSearchPosition();
        } else {
            searchContainer.style.display = "none";
        }
    });

    // Initial position update
    updateSearchPosition();

    // When a result is selected, move the marker to the selected location
    geocoder.on("result", (e) => {
        marker.setLngLat(e.result.center);
        updateSearchPosition();
        updateIsochrones();
    });

    // Add the marker to the markers array
    markers.push(marker);
}


// Add event listener for the "Add New Marker" button
document.getElementById("add-marker").addEventListener("click", () => {
    if (markers.length === 0) {
        // If no markers, add the first marker at the user's location
        geolocateControl.trigger();
        geolocateControl.once("geolocate", (e) => {
            const lngLat = [e.coords.longitude, e.coords.latitude];
            addMarker(lngLat, "#FF0000"); // Add the marker with a specific color
        });
    } else {
        // Add the marker at the location of the previous marker
        const lngLat = markers[markers.length - 1].getLngLat();
        const colors = ["#FFA500", "#0000FF", "#800080"]; // Colors for new markers
        const color = colors[markers.length % colors.length]; // Cycle through colors
        addMarker(lngLat, color);
    }
});

// Add event listener for exporting isochrones as KML
document.getElementById("export-kml").addEventListener("click", () => {
  exportIsochronesToKML();
});

// Initialize isochrones when the map loads
map.on("load", () => {
  updateIsochrones();
});

// Add event listener for the geolocate event
geolocateControl.on("geolocate", (e) => {
  const userLocation = [e.coords.longitude, e.coords.latitude];
  if (markers.length === 0) {
    addMarker(userLocation, "#FF0000"); // Add the first marker at the user's location
  }
});

// Function to export isochrones as KML
function exportIsochronesToKML() {
  // Get the isochrone data from the map source
  const isochroneSource = map.getSource("iso");
  if (!isochroneSource) {
    alert("No isochrone data available to export.");
    return;
  }

  // Convert the isochrone data to KML using the tokml library
  const kml = tokml(isochroneSource._data);

  // Create a download link for the KML file
  const blob = new Blob([kml], {
    type: "application/vnd.google-earth.kml+xml"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "isochrones.kml";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Add event listener for exporting isochrones as KML
document.getElementById("export-kml").addEventListener("click", () => {
  exportIsochronesToKML();
});