
let map, marker;
let selectedFiles = [];

// Initialize map centered on continental USA
function initMap() {
    // Default center is USA
    const defaultCenter = [39.8283, -98.5795];
    map = L.map('map').setView(defaultCenter, 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', function(e) {
        updateCoordinates(e.latlng);
        reverseGeocode(e.latlng);
    });
}

// Address search functionality
async function searchAddress() {
    const query = document.getElementById('searchInput').value;
    if (!query) return;

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&bounded=1&viewbox=-125,24.5,-66.5,49`
        );
        const data = await response.json();
        
        if (data.length > 0) {
            const firstResult = data[0];
            const latLng = {
                lat: parseFloat(firstResult.lat),
                lng: parseFloat(firstResult.lon)
            };
            updateCoordinates(latLng);
            reverseGeocode(latLng);
            map.setView(latLng, 12);
        } else {
            alert('No results found for this address');
        }
    } catch (error) {
        console.error('Search error:', error);
        alert('Error searching for address');
    }
}

// Update coordinates and marker
function updateCoordinates(latlng) {
    document.getElementById('latitude').value = latlng.lat.toFixed(6);
    document.getElementById('longitude').value = latlng.lng.toFixed(6);
    
    if (marker) map.removeLayer(marker);
    marker = L.marker(latlng, {draggable: true}).addTo(map);
    
    marker.on('dragend', function(e) {
        const newLatLng = marker.getLatLng();
        updateCoordinates(newLatLng);
        reverseGeocode(newLatLng);
    });
}

// Reverse geocoding
async function reverseGeocode(latlng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`
        );
        const data = await response.json();
        document.getElementById('address').value = data.display_name || '';
    } catch (error) {
        console.error('Geocoding error:', error);
        document.getElementById('address').value = 'Address lookup failed';
    }
}

// Convert image to JPEG format
function convertToJpeg(imageSrc) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white'; // Set white background
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = imageSrc;
    });
}

// Handle multiple file selection
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    selectedFiles = files;
    updatePreviewList(files);
}

// Update preview list
function updatePreviewList(files) {
    const previewList = document.getElementById('previewList');
    previewList.innerHTML = '';

    files.forEach((file, index) => {
        const preview = document.createElement('div');
        preview.className = 'image-preview-item';
        
        const img = document.createElement('img');
        const reader = new FileReader();
        
        reader.onload = function(e) {
            img.src = e.target.result;
            
            // Try to extract existing GPS data
            try {
                const exifData = piexif.load(e.target.result);
                if (exifData.GPS) {
                    const lat = parseGPS(
                        exifData.GPS[piexif.GPSIFD.GPSLatitude],
                        exifData.GPS[piexif.GPSIFD.GPSLatitudeRef]
                    );
                    const lng = parseGPS(
                        exifData.GPS[piexif.GPSIFD.GPSLongitude],
                        exifData.GPS[piexif.GPSIFD.GPSLongitudeRef]
                    );
                    
                    // Only update map view if we have valid coordinates
                    if (!isNaN(lat) && !isNaN(lng) && 
                        lat !== 0 && lng !== 0 && 
                        Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                        updateCoordinates({lat, lng});
                        map.setView([lat, lng], 13);
                    }
                }
            } catch (error) {
                console.log('No existing EXIF data or error reading it:', error);
            }
        };
        
        reader.readAsDataURL(file);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeImage(index);
        
        preview.appendChild(img);
        preview.appendChild(removeBtn);
        previewList.appendChild(preview);
    });
}

// Remove image from selection
function removeImage(index) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index);
    updatePreviewList(selectedFiles);
}

// Process all images
async function processImages() {
    if (selectedFiles.length === 0) {
        alert('Please select at least one image');
        return;
    }

    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);
    
    if (isNaN(lat) || isNaN(lng)) {
        alert('Please set valid coordinates by clicking on the map or searching an address');
        return;
    }

    const progressBar = document.getElementById('progressBar');
    const progressBarFill = document.getElementById('progressBarFill');
    progressBar.style.display = 'block';
    
    const metadata = {
        title: document.getElementById('imageTitle').value,
        description: document.getElementById('imageDescription').value,
        keywords: document.getElementById('imageKeywords').value,
        author: document.getElementById('imageAuthor').value,
        copyright: document.getElementById('imageCopyright').value,
        address: document.getElementById('address').value
    };

    for (let i = 0; i < selectedFiles.length; i++) {
        try {
            await processImage(selectedFiles[i], metadata, lat, lng);
            progressBarFill.style.width = `${((i + 1) / selectedFiles.length) * 100}%`;
        } catch (error) {
            console.error('Error processing image:', error);
        }
    }

    alert('All images processed successfully!');
    progressBar.style.display = 'none';
    progressBarFill.style.width = '0%';
}

// Process single image
async function processImage(file, metadata, lat, lng) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                let imageData = e.target.result;
                const originalName = file.name.split('.').slice(0, -1).join('.');
                
                if (!file.type.match(/jpeg|jpg/i)) {
                    imageData = await convertToJpeg(imageData);
                }

                const exifObj = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}};
                const processDate = new Date();

                // GPS Data
                const latAbs = Math.abs(lat);
                const lngAbs = Math.abs(lng);
                
                exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? 'N' : 'S';
                exifObj.GPS[piexif.GPSIFD.GPSLatitude] = decimalToDMS(latAbs);
                exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
                exifObj.GPS[piexif.GPSIFD.GPSLongitude] = decimalToDMS(lngAbs);
                exifObj.GPS[piexif.GPSIFD.GPSVersionID] = [2, 2, 0, 0];

                // Add metadata
                if (metadata.title) exifObj["0th"][piexif.ImageIFD.XPTitle] = unicodeToBytes(metadata.title);
                if (metadata.description) exifObj["0th"][piexif.ImageIFD.ImageDescription] = metadata.description;
                if (metadata.keywords) exifObj["0th"][piexif.ImageIFD.XPKeywords] = unicodeToBytes(metadata.keywords);
                if (metadata.author) exifObj["0th"][piexif.ImageIFD.Artist] = metadata.author;
                if (metadata.copyright) exifObj["0th"][piexif.ImageIFD.Copyright] = metadata.copyright;
                if (metadata.address) exifObj.GPS[piexif.GPSIFD.GPSAreaInformation] = metadata.address;

                // Add software and date information
                exifObj["0th"][piexif.ImageIFD.Software] = "";
                exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = 
                    processDate.toISOString().replace(/[-:]/g, ':').split('T')[0] + ' ' + 
                    processDate.toTimeString().split(' ')[0];

                const dateString = 
                    String(processDate.getMonth() + 1).padStart(2, '0') +
                    String(processDate.getDate()).padStart(2, '0') +
                    String(processDate.getFullYear()).slice(-2);

                const exifBytes = piexif.dump(exifObj);
                const newImageData = piexif.insert(exifBytes, imageData);

                const fileName = `${originalName}_geotagged_${dateString}.jpg`;
                const byteCharacters = atob(newImageData.split(',')[1]);
                const byteNumbers = new Array(byteCharacters.length);
                
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {type: 'image/jpeg'});
                
                const downloadLink = document.createElement('a');
                downloadLink.href = URL.createObjectURL(blob);
                downloadLink.download = fileName;
                downloadLink.click();
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsDataURL(file);
    });
}

// Parse GPS data from existing EXIF
function parseGPS(coord, ref) {
    if (!coord) return NaN;
    let value = coord[0][0]/coord[0][1] +
               coord[1][0]/coord[1][1]/60 +
               coord[2][0]/coord[2][1]/3600;
    if (ref === 'S' || ref === 'W') value = -value;
    return value;
}

// Convert decimal coordinates to DMS format
function decimalToDMS(decimal) {
    const deg = Math.floor(decimal);
    const minFloat = (decimal - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = (minFloat - min) * 60 * 100;
    return [[deg, 1], [min, 1], [Math.round(sec), 100]];
}

// Convert Unicode string to bytes for EXIF
function unicodeToBytes(str) {
    const utf16 = unescape(encodeURIComponent(str));
    const bytes = new Array(utf16.length * 2);
    for(let i = 0; i < utf16.length; i++) {
        const code = utf16.charCodeAt(i);
        bytes[i * 2] = code & 0xFF;
        bytes[i * 2 + 1] = code >> 8;
    }
    return bytes;
}

// Initialize map and set up event listeners
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // Set up event listeners
    document.getElementById('searchInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') searchAddress();
    });
    
    document.getElementById('imageInput').addEventListener('change', handleFileSelect);
});