const arrowWidth = 13;
const arrowHeight = 5;
const defaultLength = 25;

var draw = SVG().addTo('#drawing').size('100%', '100%');
var allGroups = [];  // This should be your array or object containing all group objects
var globalStreamNames = Object();
var currentGroup = null; // Define a global variable to hold the current group

function setCurrentGroup(group) {
    currentGroup = group; // Set the current group
}

document.getElementById('addInputStreamButton').addEventListener('click', function() {
    if (currentGroup) { // Ensure the currentGroup is set
        addInputStreamInput(currentGroup);
    } else {
        console.error("No group selected.");
    }
});

var defaultSymbol = "M0 0 l100 0 l0 50 l-100 0 l0 -50";
var centrifugalPumpPath = "M20,0 A20,20 0 1,1 20,40 A20,20 0 1,1 20,0 Z M20,0 l20,0 l0,6 l-6,0 M10,37 l-10,10 l40,0 l-10,-10 M20,20 l-25,0";
var thickenerPath = "M0 0 l0 10 l5 0 m0 -4 l0 25 l50 20 l0 3 m0 -3 l50 -20 l0 -25 m0 4 l5 0 l0 -10";

var iconDesigns = {
    default: {  // simple rectangle
        iconPath: defaultSymbol,
        textCentre: {x: 0.5, y: 0.5},
        landingSites: ["left", "top", "left-0.3", "left-0.7", "bottom-0.3", "right-0.1"],
        attachmentSites: ["right", "bottom", "right-0.9", "right-0.05"]
    },
    "Pump (Centrifugal)": {
        iconPath: centrifugalPumpPath,
        textCentre: {x: 0.5, y: 1.2},
        landingSites: ["left"],
        attachmentSites: ["right-0.05"]
    },
    Thickener: {
        iconPath: thickenerPath,
        textCentre: {x: 0.5, y: 0.3},
        landingSites: ["top-0.4", "top-0.3"],
        attachmentSites: ["right-0.05", "bottom"]
    }
}

var iconDesignsKeys = Object.keys(iconDesigns);

// Assume we have an initial JSON object with group positions and IDs
var plantData = {  // This will be retrieved by a call to the back-end
    unit_operations: [
      { 
        id: "u0001", 
        name: "Thickener 1", 
        x: 50, y: 75,
        unitSymbol: "Thickener",
        input_stream_ids: [
            {stream_id: "s0001", landingSite: "left-0.2"},
            {stream_id: "s0005", landingSite: "top"}
        ],
        output_streams: [
            //{stream_id: "s0003", name: "Thickener 1 Underflow", attachmentSite: "bottom"}, 
            {stream_id: "s0002", name: "Thickener 1 Overflow", attachmentSite: "left-0.1"}
        ]
      },
      { 
        id: "u0002", 
        name: "Thickener 2 O/F Pump", 
        x: 350, y: 75,
        unitSymbol: "Pump (Centrifugal)",
        input_stream_ids: [
            {stream_id: "s0002", landingSite: "left-0.40"}
        ],
        output_streams: [
            {stream_id: "s0004", name: "Thickener 2 Overflow", attachmentSite: "right-0.05"},
            {stream_id: "s0005", name: "Thickener 2 Underflow", attachmentSite: "bottom" }
        ]
      },
      // ... more unit_operations
    ]
  };

function createDraggableGroup(data) {
    var group = draw.group().attr({ 'data-id': data.id });
    group.data = data
    group.referencedLines = [];
    group.referencedArrows = [];
    group.referencedCircles = [];

    // Add event listeners for dragging
    group.on('mousedown', function(event) {
        if (event.ctrlKey) {  // event.altKey
            showUnitOpConfigForm(event, group);
        } else {
            startDrag(event, group);
        }
    });

    updateGuiElements(group);
    return group;
}

function updateGuiElements(group) {
    // Update any GUI visible items, e.g., unit op name
    // Create rect/path to depict the Unit Operation icon
    var iconSymbol = group.data.unitSymbol;
    var iconPath = (iconDesigns[iconSymbol] && iconDesigns[iconSymbol].iconPath) || iconDesigns["default"].iconPath
    if (group.symbolElement) {
        group.symbolElement.remove();
    }
    group.symbolElement = group.path(iconPath)
                               .attr({ fill: 'white', stroke: 'black' })
                               .move(group.data.x, group.data.y);
    
    // calc exact height and width
    var bbox = group.symbolElement.bbox();
    group.data.w = bbox.width;
    group.data.h = bbox.height;

    // Create text for the step
    var textCentre = (iconDesigns[iconSymbol] && iconDesigns[iconSymbol].textCentre) || iconDesigns["default"].textCentre;
    
    if (group.textElement) {
        group.textElement.text(group.data.name);
    } else {
        group.textElement = group.text(group.data.name)
                               .attr({ stroke: 'black' })
                               .font({ size: 12, weight: 200, family: 'Menlo' });
    }

    // Calculate the position to center the text based on textCentre and bounding box dims
    var textBBox = group.textElement.bbox();
    var data = group.data;
    var textX = data.x + data.w * textCentre.x - textBBox.width / 2;
    var textY = data.y + data.h * textCentre.y - textBBox.height / 2;
    group.textElement.move(textX, textY);
}

function startDrag(event, group) {
    deleteUnitPeripherals(group); 
    var startX = event.clientX; // where the mouse was clicked
    var startY = event.clientY;
    var groupX = group.x(); // left-most point of group which includes all elements inc text (which can be to the left of the unit symbol)
    var groupY = group.y();
    var symbolX = group.data.x;  // left-most point of the unit operation symbol outline
    var symboly = group.data.y;
    // Add the event listeners
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', onEndDrag);

    function onDrag(event) {
        handleDrag(event, startX, startY, group, groupX, groupY);
    }

    function onEndDrag() {
        endDrag(group, symbolX, symboly, groupX, groupY);
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', onEndDrag);
    }
}

function handleDrag(event, startX, startY, group, groupX, groupY) {
    var dx = event.clientX - startX;
    var dy = event.clientY - startY;
    group.move(groupX + dx, groupY + dy);
}

function endDrag(group, symboxOrigX, symbolOrigY, groupX, groupY) {
    console.log("End drag actions.");
    var dx = group.x() - groupX;
    var dy = group.y() - groupY;
    // Update plantData
    group.data.x = symboxOrigX + dx;
    group.data.y = symbolOrigY + dy;
    //console.log(JSON.stringify(plantData, null, 2));
    drawAllConnectedStreamsForUnitOp(group);
    savePositionsIfNeeded();
}

function showUnitOpConfigForm(event, group) {
    setCurrentGroup(group); // Set the current group
    displayForm();
    populateFormFields(group);
    setFormSubmitHandler(group);
}

function displayForm() {
    var formContainer = document.getElementById('formContainer');
    formContainer.style.display = 'block';
}

function populateFormFields(group) {
    var unitName = document.getElementById('unitName');
    unitName.value = group.data.name;  

//    var unitType = document.getElementById('unitType');
//    unitType.value = group.data.unitType; // done in populateDropdowns

    populateDropdowns(group);
}

function setFormSubmitHandler(group) {
    var formContainer = document.getElementById('formContainer');
    formContainer.onsubmit = function(e) {
        e.preventDefault();
        updateGroupData(group);
        updateGuiElements(group);
        redrawConnections(group); // drawAllConnectedStreamsForUnitOp(group); this version doesn't delete
        formContainer.style.display = 'none';
        hideUnitOpConfigForm();
        //console.log(JSON.stringify(plantData, null, 2)); // Updated to format JSON output
        

    };
}

function updateGroupData(group) {
    var unitName = document.getElementById('unitName');
    var unitSymbol = document.getElementById('unitType');
    
    group.data.name = unitName.value;
    group.data.unitSymbol = unitSymbol?.value;

    // Clear previous input streams
    group.data.input_stream_ids = [];

    // Update input_stream_ids with new values
    var inputStreamsContainer = document.getElementById('inputStreamsContainer');
    var inputStreamInputs = inputStreamsContainer.getElementsByTagName('input');

    for (var i = 0; i < inputStreamInputs.length; i++) {
        var inputStreamId = inputStreamInputs[i].id.replace('inputStream', '');
        if (inputStreamId) { // Ensure it's not an empty string
            group.data.input_stream_ids.push({ stream_id: inputStreamId });
        }
    }
}

function redrawConnections(group) {
    deleteUnitPeripherals(group); 
    drawAllConnectedStreamsForUnitOp(group);
}

function hideUnitOpConfigForm() {
    var formContainer = document.getElementById('formContainer');
    formContainer.style.display = 'none';
}

function addInputStreamInput(group) {
    // First: retrieve entered value for writing 
    var inputStreamsContainer = document.getElementById('inputStreamsContainer');
    var newInputStreamSelect = document.getElementById('newInputStream');
    var selectedStreamId = newInputStreamSelect.value?.split(" - ")[0];
    var selectedStreamText = newInputStreamSelect.options[newInputStreamSelect.selectedIndex].text;

    var isStreamIdPresent = group.data.input_stream_ids.some(function(stream) {
        return stream.stream_id.toLowerCase() === selectedStreamId.toLowerCase();
    });

    if (!isStreamIdPresent) {
        // Add the selected stream to the group's input_stream_ids
        group.data.input_stream_ids.push({ stream_id: selectedStreamId });

        // Create the input field for the new stream
        var inputStreamInput = document.createElement('input');
        inputStreamInput.type = 'text';
        inputStreamInput.id = `inputStream${selectedStreamId}`;
        inputStreamInput.name = `inputStream${selectedStreamId}`;
        inputStreamInput.value = selectedStreamText;
        inputStreamInput.readOnly = true; // Make it read-only to prevent editing

        // Append the new input field to the container
        inputStreamsContainer.appendChild(inputStreamInput);

        // Optionally, reset the select dropdown to the default option
        newInputStreamSelect.value = '';
    } else {
        console.log(`Stream ID ${selectedStreamId} already exists in the list of input streams.`);
    }
}

function createFieldForExistingInputStream(stream) {
    var inputStreamsContainer = document.getElementById('inputStreamsContainer');
    var inputStreamInput = document.createElement('input');
    inputStreamInput.id = `inputStream${stream.stream_id}`;
    inputStreamInput.name = `inputStream${stream.stream_id}`;
    inputStreamInput.value = `${stream.stream_id} - ${globalStreamNames[stream.stream_id] || 'Unknown'}`; // Retrieve name from globalStreamNames
    inputStreamInput.readOnly = true; // Make it read-only to prevent editing
    inputStreamsContainer.appendChild(inputStreamInput);
}

function createFieldForExistingOutputStream(stream) {
    var outputStreamsContainer = document.getElementById('outputStreamsContainer');
    var outputStreamInput = document.createElement('input');
    outputStreamInput.id = `outputStream${stream.stream_id}`;
    outputStreamInput.name = `outputStream${stream.stream_id}`;
    outputStreamInput.value = `${stream.stream_id} - ${globalStreamNames[stream.stream_id] || 'Unknown'}`; // Retrieve name from globalStreamNames
    outputStreamInput.readOnly = true; // Make it read-only to prevent editing
    outputStreamsContainer.appendChild(outputStreamInput);
}

function populateDropdowns(currentGroup) {
    var inputStreamsContainer = document.getElementById('inputStreamsContainer');
    var newInputStreamSelect = document.getElementById('newInputStream');
    var outputStreamsContainer = document.getElementById('outputStreamsContainer');
    var unitTypeSelect = document.getElementById('unitType');

    inputStreamsContainer.innerHTML = ''; // Clear previous output streams
    newInputStreamSelect.innerHTML = ''; // Clear previous options
    outputStreamsContainer.innerHTML = ''; // Clear previous output streams
    unitTypeSelect.innerHTML = '';

    // Add default option to the newInputStream select control
    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.text = '-- select a stream --';
    newInputStreamSelect.appendChild(defaultOption);

    // Add default option to the unitType select control
    
    var defaultTypeOption = document.createElement('option');
    defaultTypeOption.value = '';
    defaultTypeOption.text = '-- select a type --';
    unitTypeSelect.appendChild(defaultTypeOption);
    iconDesignsKeys.forEach(function(iconSymbol) {
        var inputOption = document.createElement('option');
        inputOption.value = iconSymbol;
        inputOption.text = iconSymbol;
        unitTypeSelect.appendChild(inputOption);
    })
    unitTypeSelect.value = currentGroup.data.unitSymbol;
    
    // Gather labels for stream names
    globalStreamNames = {};
    plantData.unit_operations.forEach(function(unit) {
        unit.output_streams.forEach(function(stream) {
            globalStreamNames[stream.stream_id] = stream.name;
        });
    });

    // Populate the input and output streams fields
    plantData.unit_operations.forEach(function(unit) {
        if (unit.id !== currentGroup.data.id) {
            // Populate inputStreams dropdown
            unit.output_streams.forEach(function(stream) {
                var inputOption = document.createElement('option');
                inputOption.value = stream.stream_id;
                inputOption.text = `${stream.stream_id} - ${stream.name}`; // Set the label
                newInputStreamSelect.appendChild(inputOption);
            });
        } else {
            unit.input_stream_ids.forEach(function(stream) {
                createFieldForExistingInputStream(stream);
            });         
            unit.output_streams.forEach(function(stream) {
                createFieldForExistingOutputStream(stream);
            });
        }
    });    
}

document.getElementById('cancel').addEventListener('click', function() {
    hideUnitOpConfigForm();
});

function drawAllConnectedStreamsForUnitOp(group) {
    reconnectUpstream(group);
    reconnectDownstream(group);
}

function reconnectUpstream(group) {
    group.data.input_stream_ids.forEach(function(stream, idx) {
        var stream_id = stream.stream_id;
        console.log("Searching for unit assoc with stream ID: " + stream_id);
        var unitId = findInputUnits(stream.stream_id, plantData);
        if (unitId) {
            console.log("Found unit = " + unitId);
            var groupElement = allGroups.find(group => group.attr('data-id') === unitId);
            deleteUnitPeripherals(groupElement); 
            groupElement.data.output_streams.forEach(function(stream, idx) {
                console.log("idx " + idx + ": attempting to redraw stream_id " + stream.stream_id);
                drawLineAndArrow(groupElement, idx);
            });
        } else {
            console.log("Unit id was null");
        }
    });
}

function reconnectDownstream(group) {
    group.data.output_streams.forEach(function(stream, idx) {
        drawLineAndArrow(group, idx);
    });
}

function savePositionsIfNeeded() {
    if (plantData) {
        savePositionsToFile(plantData);
    }
}

function findInputUnits(streamId, plantData) {
    for (let unit of plantData.unit_operations) {
        for (let stream of unit.output_streams) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                return unit.id;
            }
        }
    }
    return null;
}

function findLandingXY(streamId, plantData) {
    if (!plantData || !plantData.unit_operations) {
        return {x: null, y: null, landingSide: null};
    }

    for (let unit of plantData.unit_operations) {
        for (let stream of unit.input_stream_ids) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                const landingSide = stream.landingSite?.split("-")[0];
                const { x, y, w, h } = unit;

                switch (landingSide) {
                    case "right":
                        return { x: x + w, y: y + h / 2, landingSide: landingSide };
                    case "top":
                        return { x: x + w / 2, y: y, landingSide: landingSide };
                    case "bottom":
                        return { x: x + w / 2, y: y + h, landingSide: "bottom" };
                    case "left":
                    default:
                        return { x: x, y: y + h / 2, landingSide: landingSide };
                }
            }
        }
    }
    return { x: null, y: null, landingSide: null };
}

/*
Calculate start and end of line that connects this stream to the src and dst units.
*/
function calculateLineEndsToDischargeStream(data, idx) {
    let lineStartX, lineStartY, lineEndX, lineEndY, landingSide;
    let dischargeAttachment = data.output_streams[idx]?.attachmentSite;
    let [dischargeAttachSide, sideFraction = 0.5] = dischargeAttachment?.split("-") || [];
    sideFraction = parseFloat(sideFraction);
    // Find the attachment site to receiving unitOp
    let myStreamId = data.output_streams[idx].stream_id;
    let landingSite = findLandingXY(myStreamId, plantData);
    ({ x: lineEndX, y: lineEndY, landingSide } = landingSite);
    // Determine line start coordinates based on the discharge attachment side
    switch (dischargeAttachSide) {
        case "bottom":
            lineStartX = data.x + data.w * sideFraction;
            lineStartY = data.y + data.h;
            break;
        case "top":
            lineStartX = data.x + data.w * sideFraction;
            lineStartY = data.y;
            break;
        case "left":
            lineStartX = data.x;
            lineStartY = data.y + data.h * sideFraction;
            break;
        case "right":
            lineStartX = data.x + data.w;
            lineStartY = data.y + data.h * sideFraction;
            break;
    }
    // Handle dangling stream if lineEndX or lineEndY is null
    if (lineEndX === null || lineEndY === null) {
        console.log("Handling dangling streams");
        switch (dischargeAttachSide) {
            case "right":
                lineEndX = lineStartX + defaultLength;
                lineEndY = lineStartY;
                break;
            case "bottom":
                lineEndX = lineStartX;
                lineEndY = lineStartY + defaultLength;
                break;
            case "top":
                lineEndX = lineStartX;
                lineEndY = lineStartY - defaultLength;
                break;
            case "left":
                lineEndX = lineStartX - defaultLength;
                lineEndY = lineStartY;
                break;
        }
    }
    return { lineStartX, lineStartY, lineEndX, lineEndY, dischargeAttachSide, landingSide };
}

var allLineSegments = [];  //[{id: <some_id>, data: [[p1, q1, p2, q2], [p2, q2, p3, q3]]}]

function getNewLinesObject(unitId, streamId, poly) {
    var newObj = {};
    newObj.unitId = unitId;
    newObj.streamId = streamId;
    newObj.data = [];

    // Loop through the polygon points
    for (let i = 0; i < poly.length - 1; i++) {
        // Get the current and next points
        let p1 = { x: parseFloat(poly[i][0]), y: parseFloat(poly[i][1]) };
        let p2 = { x: parseFloat(poly[i + 1][0]), y: parseFloat(poly[i + 1][1]) };

        // Add the segment defined by these two points
        newObj.data.push({ p1: p1, p2: p2 });
    }
    return newObj;
}

function addToAllLines(group, idx, poly) {
    var unitId = group.data.id;
    var streamId = group.data.output_streams[idx].stream_id;
    var newObj = getNewLinesObject(unitId, streamId, poly);
    allLineSegments.push(newObj);
    return true;
}

function deleteUnitPeripherals(group) {
    deleteItemsFromAllLineSegments(group);
    deleteLinesArrowsCirclesFromGroup(group);
}

function deleteItemsFromAllLineSegments(group) {
    // Assuming group.data.unit_id is the unique identifier for the group's lines
    var unitId = group.data.unit_id;
    
    // Filter out the lines that belong to the given group
    allLineSegments = allLineSegments.filter(line => line.id !== unitId);
}

function deleteLinesArrowsCirclesFromGroup(group) {
    console.log("Deleting lines and arrow for unit " + group.data.id);
    group.referencedLines.forEach(line => line.remove());
    group.referencedArrows.forEach(arrow => arrow.remove());
    group.referencedCircles.forEach(circle => circle.remove());
    group.referencedLines = [];
    group.referencedArrows = [];
    group.referencedCircles = [];
}


// Function to calculate the orientation of the triplet (p, q, r)
function orientor(p, q, r) {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (val === 0) return 0; // collinear
    return (val > 0) ? 1 : 2; // clock or counterclock wise
  }
  
  // Function to check if point q lies on line segment pr
  function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
           q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  }
  
  // Function to check if line segment 'p1q1' and 'p2q2' intersect
  function doIntersect(p1, q1, p2, q2) {
    const o1 = orientor(p1, q1, p2);
    const o2 = orientor(p1, q1, q2);
    const o3 = orientor(p2, q2, p1);
    const o4 = orientor(p2, q2, q1);
  
    // General case
    if (o1 !== o2 && o3 !== o4) return true;
  
    // Special cases
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  
    return false;
  }
  
  // Function to calculate intersection point of two lines (p1, q1) and (p2, q2)
  function lineIntersection(p1, q1, p2, q2) {
    const A1 = q1.y - p1.y;
    const B1 = p1.x - q1.x;
    const C1 = A1 * p1.x + B1 * p1.y;
  
    const A2 = q2.y - p2.y;
    const B2 = p2.x - q2.x;
    const C2 = A2 * p2.x + B2 * p2.y;
  
    const determinant = A1 * B2 - A2 * B1;
  
    if (determinant === 0) {
      // The lines are parallel
      return null;
    } else {
      const x = (B2 * C1 - B1 * C2) / determinant;
      const y = (A1 * C2 - A2 * C1) / determinant;
      return { x, y };
    }
  }

  function checkForCollisionWithExistingLines(proposedBridgeSection) {
    var collisions = [];
    for (let i = 0; i < proposedBridgeSection.length - 1; i++) {
        const segment1 = { p1: { x: proposedBridgeSection[i][0], y: proposedBridgeSection[i][1] }, p2: { x: proposedBridgeSection[i + 1][0], y: proposedBridgeSection[i + 1][1] } };
        for (let j = 0; j < allLineSegments.length; j++) {
            const lines = allLineSegments[j].data;
            const unitId = allLineSegments[j].unitId;
            const streamId = allLineSegments[j].streamId;
            for (let k = 0; k < lines.length; k++) {        
                const segment2 = { p1: lines[k].p1, p2: lines[k].p2 };
                if (doIntersect(segment1.p1, segment1.p2, segment2.p1, segment2.p2)) {
                    const intersection = lineIntersection(segment1.p1, segment1.p2, segment2.p1, segment2.p2);
                    if (intersection) {
                        console.log(`Collision detected between proposed section segment and line ${streamId} from ${unitId} at (${intersection.x}, ${intersection.y})`);
                        collisions.push(intersection);
                    }
                }
            }
        }
    }
    return collisions;
}

function generateRandomString() {
    return 'xxxxxxxx'.replace(/[x]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return r.toString(16);
    });
}

function drawLineAndArrow(group, idx) {
    // Calculate start positions for line inside this function
    var { lineStartX, lineStartY, lineEndX, lineEndY, dischargeAttachSide, landingSide } = calculateLineEndsToDischargeStream(group.data, idx);

    // Create a new polyline with at least 5 nodes using the SVG.js methods
    let point1 = [lineStartX, lineStartY]; 
    if (group.data.id == "u0001" && idx == 0) { console.log(`LineStartX: ${lineStartX}, lineEndX ${lineEndX}`); }
    let point2, point3, point4, point5;
    let point6 = [lineEndX, lineEndY];

    switch (dischargeAttachSide) {
        case "bottom": // insert coordinates after the first coordinates for a point that is vertically below the starting point
            point2 = [lineStartX, lineStartY + defaultLength];
            break;
        case "top": 
            point2 = [lineStartX, lineStartY - defaultLength];
            break;
        case "right":
            point2 = [lineStartX + defaultLength, lineStartY];
            break;
        case "left":
            point2 = [lineStartX - defaultLength, lineStartY];
            break;
        default:
            break;
    }

    switch (landingSide) {
        case "bottom":
            point5 = [lineEndX, lineEndY + defaultLength];
            break;
        case "top":
            point5 = [lineEndX, lineEndY - defaultLength];
            break;
        case "left":
            point5 = [lineEndX - defaultLength, lineEndY];
            break;
        case "right":
            point5 = [lineEndX + defaultLength, lineEndY];
            break;
    }

    // handle special cases of same side attachment and landing: point3 == point 4
    if (landingSide === "bottom" && dischargeAttachSide === "bottom") { // i.e. same side and landing
        var point3Y = Math.max(point2[1], point5[1]);
        var midPointX = (point2[0] + point5[0]) / 2;
        point3 = [midPointX, point3Y];
        point4 = [midPointX, point3Y];
    }
    else if (landingSide === "top" && dischargeAttachSide === "top") { // i.e. same side as landingSide
        var point3Y = Math.min(point2[1], point5[1]);
        var midPointX = (point2[0] + point5[0]) / 2;
        point3 = [midPointX, point3Y];
        point4 = [midPointX, point3Y];
    } 
    // handle special case of non-adjacent attachment and landing sides: point 3 must be either lower than both or higher than both units.
    else if ((dischargeAttachSide === "right" && lineStartX > lineEndX) || (dischargeAttachSide === "left" && lineEndX > lineStartX) ) { 
        if (point5[1] > point2[1]) { // then go down and under
            var point3Y = Math.max(point2[1], point5[1]);
            point3 = [point2[0], point3Y];
            point4 = [point5[0], point3Y];
        } else { // go up and over
            var point3Y = Math.min(point2[1], point5[1]);
            point3 = [point2[0], point3Y];
            point4 = [point5[0], point3Y];
        }
    } 
    else if (landingSide) {  // not so special, point3 and point 4 will be vertically aligned
        var midPointX = (point2[0] + point5[0]) / 2;
        // offset a little so that we don't have collinear lines when pattern is criss-cross
        if (lineStartX < lineEndX) {
            midPointX -= 5; 
        } else if (landingSide !== null){
            midPointX += 5; 
        }
        point3 = [midPointX, point2[1]];
        point4 = [midPointX, point5[1]];
    }
    
    let polyCoordinates, fillColour, proposedBridgeSection;

    if (landingSide === null) {
        // Create a polyline with just point1 and point2
        polyCoordinates = proposedBridgeSection = [point1, point2];
        fillColour = 'red';
    } else {
        polyCoordinates = [point1, point2, point3, point4, point5, point6];
        proposedBridgeSection = [point3, point4];
        fillColour = '#000';
    }

    // Check if proposed offers any clashes with existing line segments in allLines.
    var results = checkForCollisionWithExistingLines(proposedBridgeSection);
    results.forEach(res => {
        var circle = group.circle(5).fill('#fff').move(res.x - 2.5, res.y - 2.5);
        group.referencedCircles.push(circle);
    });
    // finally, add the line and arrow to the SVG
    var newLine = group.polyline(polyCoordinates).fill('none').stroke({ color: fillColour, width: 2 });
    const landedSide = determineLandedSide(landingSide, dischargeAttachSide);  // necessary for dangling streams to point arrow correctly
    if (group.data.id == "u0001" && idx == 0) { console.log(`LineStartX: ${lineStartX}, lineEndX ${lineEndX}`); }
    var newArrow = drawArrowHeads(group, landedSide, lineEndX, lineEndY, fillColour);

    // If you need to reference these later, you can assign them to properties on the group
    group.referencedLines.push(newLine);
    group.referencedArrows.push(newArrow);
    addToAllLines(group, idx, polyCoordinates);  // allLines is used when checking for collisions.
}

function drawArrowHeads(group, landedSide, lineEndX, lineEndY, fillColour = "#000") {
    let newArrow;
    switch (landedSide) {
        case "right":
            newArrow = group.polygon(`0,0 ${arrowWidth},${arrowHeight} ${arrowWidth},-${arrowHeight}`);
            newArrow.move(lineEndX, lineEndY - arrowHeight);
            break;
        case "bottom":
            newArrow = group.polygon(`0,0 ${arrowHeight},0 0,-${arrowWidth} -${arrowHeight},0`);
            newArrow.move(lineEndX - arrowHeight, lineEndY);
            break;
        case "top":
            newArrow = group.polygon(`0,0 -${arrowHeight},0 0,${arrowWidth} ${arrowHeight},0`);
            newArrow.move(lineEndX - arrowHeight, lineEndY - arrowWidth);
            break;
        default: // "left"
            newArrow = group.polygon(`0,0 0,${arrowHeight} ${arrowWidth},0 0,-${arrowHeight}`);
            newArrow.move(lineEndX - arrowWidth, lineEndY - arrowHeight);
    }
    newArrow.fill(fillColour);
    return newArrow;
}

function determineLandedSide(landingSide, dischargeAttachSide) {
    if (landingSide !== null) {
        return landingSide;
    }
    switch (dischargeAttachSide) {
        case "right": return "left";
        case "left": return "right";
        case "top": return "bottom";
        case "bottom": return "top";
        default: return null;
    }
}

// Function to save the updated positions to a file
function savePositionsToFile(updatedData) {
    // Convert the JSON object to a string
    var jsonString = JSON.stringify(updatedData);
    
    // Code to save jsonString to a file
    // This will depend on your environment, e.g., Node.js, browser, etc.
    // For example, in Node.js, you might use fs.writeFileSync('path/to/file.json', jsonString);
}

// Create unit_operations from the JSON data
plantData.unit_operations.forEach(data => {
    var grp = createDraggableGroup(data);
    allGroups.push(grp);
});

// Now connect them all together by drawing connector lines with arrowheads.
plantData.unit_operations.forEach(data => {
    var unitId = data.id;
    var group = allGroups.find(group => group.attr('data-id') === unitId);
    data.output_streams.forEach(function(stream, idx) {
        drawLineAndArrow(group, idx);
    });
});
