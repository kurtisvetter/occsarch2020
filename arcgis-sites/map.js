require([
    'esri/Map',
    'esri/views/MapView',
    'esri/widgets/Slider',
    'esri/widgets/Expand',
    'esri/widgets/Legend',
    'esri/layers/FeatureLayer',
    'esri/layers/GraphicsLayer',
    'esri/core/watchUtils',
    'esri/widgets/Sketch/SketchViewModel',
    'esri/geometry/Polyline',
    'esri/geometry/geometryEngine',
    'esri/Graphic',
    'esri/Basemap',
  ], function (
    Map,
    MapView,
    Slider,
    Expand,
    Legend,
    FeatureLayer,
    GraphicsLayer,
    watchUtils,
    SketchViewModel,
    Polyline,
    geometryEngine,
    Graphic,
    Basemap
  ) {
    
    // Unique-value map
    const uniqueRenderer = {
      type: 'unique-value',
      field: 'sym_struc',
      defaultSymbol: { type: 'simple-marker', size: 6, color: 'white' },
      legendOptions: { title: 'Symmetry' },
    };
  
    // an array of colors that will be used to color sites by symmetry prevalence
    const colors = [
      'blue',
      'green',
      'yellow',
      'red',
    ];

    // TODO
    // Color the sites according to the frequency of the selected symmetry
    function updateColoring() {

    }
  
    var symRadios = document.getElementsByName('sym-field');
    var symField = 'sym_struc';
    var symmetrySelect = document.getElementById('symmetry-type');
    var symOptions = [
      'C1',
      'C2',
      'C3',
      'C4',
      'C6',
      'D1',
      'D2',
      'D3',
      'D4',
      'D6',
      'p111',
      'p112',
      'p1m1',
      'pm11',
      'pmm2',
      'pma2',
      'p1a1',
      'p1',
      'p2',
      'cmm',
      'pgg',
      'pmg',
      'p4m',
      'asym',
    ]
    symOptions.sort();
    symOptions.forEach(function (sym) {
      var option = document.createElement('option');
      option.text = sym;
      symmetrySelect.add(option);
    });
    var selectedSymmetries = ['All'];
  
    var timeSlider = new Slider({
      container: 'time',
      min: 400,
      max: 1700,
      steps: 25,
      values: [1000],
      visibleElements: {
        labels: true,
        rangeLabels: true,
      },
    });

    const dataURL = 'https://services5.arcgis.com/yVCUkdcXCabMuIIK/arcgis/rest/services/TableOfSites/FeatureServer';
    var dataLayer = new FeatureLayer({
      url: dataURL,
      // outFields configured for tables of sites
      outFields: [
        'site_ID',
        'site_desig',
        'site_name',
        'site_quad',
        'Elevation',
        'earliest',
        'latest',
      ],
      popupTemplate: {
        // TODO: title
        title: 'Site',
        content: [
          {
            type: 'fields',
            fieldInfos: [
              { fieldName: 'site_ID' },
              { fieldName: 'site_desig' },
              { fieldName: 'site_name' },
              { fieldName: 'site_quad' },
              { fieldName: 'Elevation' },
              { fieldName: 'earliest' },
              { fieldName: 'latest' },
            ],
          },
        ],
      },
      legendEnabled: true,
      renderer: uniqueRenderer,
    });
  
    // used for selection area for frequency graph
    var centerGraphic,
      edgeGraphic,
      polylineGraphic,
      bufferGraphic,
      centerGeometryAtStart,
      labelGraphic;
    const unit = 'kilometers';
  
    var graphicsLayer = new GraphicsLayer();
    var bufferLayer = new GraphicsLayer({
      blendMode: 'color-burn',
    });
  
    // Create basemap from the custom map
    var custom_basemap = new Basemap({
      portalItem: {
        id: '4837420847a14d32a367ad0ad1e8658d',
        // The map is currently set to public; for now, all zooming factors are acceptable, which means the visibility range is at max
      },
    });
  
    var map = new Map({
      basemap: custom_basemap, // before we used "topo"
      layers: [dataLayer, bufferLayer, graphicsLayer],
    });
  
    var view = new MapView({
      container: 'viewDiv',
      map: map,
      //TODO: figure out the best center point and also move circle selector to a better initial point
      center: [-108, 35.3],
      zoom: 7,
    });
  
    var featureLayerView;
  
    // Add the opacity slider
    var opacitySlider = new Slider({
      container: 'opacity',
      min: 0,
      max: 1,
      values: [1],
      visibleElements: {
        rangeLabels: true,
      },
    });
    opacitySlider.on(['click', 'thumb-drag', 'thumb-change'], function () {
      var opacity = opacitySlider.values[0];
      dataLayer.opacity = opacity;
      bufferLayer.opacity = opacity;
    });
  
    //TODO: show the color ranges for symmetry prevalence in the legend
    const legend = new Legend({
      view: view,
      container: 'legendDiv',
      layerInfos: [
        {
          layer: dataLayer,
          title: 'Legend',
        },
      ],
    });
  
    var chartExpand = new Expand({
      expandIconClass: 'esri-icon-chart',
      expandTooltip: 'Symmetry Frequency Chart',
      expanded: false,
      view: view,
      content: document.getElementById('chartPanel'),
    });
  
    // setting up various UI elements
    view.ui.add(legend, 'top-right');
    view.ui.add('infoDiv', 'bottom-right');
    view.ui.add(chartExpand, 'bottom-left');
  
    // get a list of unique symmetries from the tables of designs
    // Uses Papaparse for csv parsing
    var designs;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'Designs.csv', true);
    xhr.overrideMimeType('text/plain');
    xhr.onreadystatechange = function() {
        if (this.readyState == XMLHttpRequest.DONE && this.status == 200) {
            designs = xhr.response;
            results = Papa.parse(xhr.response, {
                header: true
            });
            for (err of results.errors) {
                console.error('CSV parsing error: ', err);
            }
            designs = results.data;
            document.getElementById('hideLoading').remove();
        }
    };
    xhr.send();
    
    // symmetry filter selector handler
    symmetrySelect.addEventListener('change', function () {
      selectedSymmetries = [];
      for (var i = 0; i < symmetrySelect.options.length; i++) {
        if (symmetrySelect.options[i].selected) {
          selectedSymmetries.push(symmetrySelect.options[i].text);
        }
      }
      updateLayerView();
    });
  
    // symmetry field selector handler
    symRadios.forEach(function (obj) {
      obj.addEventListener('change', function (event) {
        symField = event.target.value;
        dataLayer.renderer.field = event.target.value;
        updateLayerView();
      });
    });

    // time filter handler
    timeSlider.on(['thumb-drag', 'thumb-change', 'segment-drag'], function() {
        if (!document.getElementById('ignoreTime').checked)
          updateLayerView();
      });
    document.getElementById('ignoreTime').addEventListener('change', updateLayerView);
  
    // Things to do when the layerView first loads
    view.whenLayerView(dataLayer).then(function (layerView) {
      featureLayerView = layerView;
  
      // create a watcher to trigger drawing of the buffer (selection area) polygon
      pausableWatchHandle = watchUtils.pausable(layerView, 'updating', function (
        val
      ) {
        if (!val) {
          drawBufferPolygon();
          updateLayerView();
        }
      });
  
      // Display directions when the layerView is loading
      watchUtils.whenFalseOnce(layerView, 'updating', function () {
        view.popup.open({
          title: 'Center point',
          content:
            'Drag this point to move the buffer.<br> ' +
            'Or drag the <b>Edge</b> point to resize the buffer.<br>' +
            'Click the chart icon in the bottom left to show the results.',
          location: centerGraphic.geometry,
        });
        view.popup.alignment = 'top-left';
      });
  
      // close the popup when the user clicks out of it
      view.watch('focused', function (newValue) {
        if (newValue) {
          view.popup.close();
        }
      });
    });
  
    setUpSketch();
    // Create SketchViewModel and wire up event listeners
    function setUpSketch() {
      sketchViewModel = new SketchViewModel({
        view: view,
        layer: graphicsLayer,
      });
  
      // Listen to SketchViewModel's update event so the symmetry frequency chart
      // is updated as the graphics are updated
      sketchViewModel.on('update', onMove);
    }
  
    // Edge or center graphics are being moved. Recalculate the buffer with
    // updated geometry information and run the query stats again.
    function onMove(event) {
      // If the edge graphic is moving, keep the center graphic
      // at its initial location. Only move edge graphic
      if (event.toolEventInfo && event.toolEventInfo.mover.attributes.edge) {
        const toolType = event.toolEventInfo.type;
        if (toolType === 'move-start') {
          centerGeometryAtStart = centerGraphic.geometry;
        }
        // keep the center graphic at its initial location when edge point is moving
        else if (toolType === 'move' || toolType === 'move-stop') {
          centerGraphic.geometry = centerGeometryAtStart;
        }
      }
  
      // the center or edge graphic is being moved, recalculate the buffer
      const vertices = [
        [centerGraphic.geometry.x, centerGraphic.geometry.y],
        [edgeGraphic.geometry.x, edgeGraphic.geometry.y],
      ];
  
      // client-side stats query of features that intersect the buffer
      calculateBuffer(vertices);
  
      // user is clicking on the view... call update method with the center and edge graphics
      if (event.state === 'complete') {
        sketchViewModel.update([edgeGraphic, centerGraphic], {
          tool: 'move',
        });
      }
    }
  
    function calculateBuffer(vertices) {
      // Update the geometry of the polyline based on location of edge and center points
      polylineGraphic.geometry = new Polyline({
        paths: vertices,
        spatialReference: view.spatialReference,
      });
  
      // Recalculate the polyline length and buffer polygon
      const length = geometryEngine.geodesicLength(
        polylineGraphic.geometry,
        unit
      );
      const buffer = geometryEngine.geodesicBuffer(
        centerGraphic.geometry,
        length,
        unit
      );
  
      // Update the buffer polygon
      bufferGraphic.geometry = buffer;
  
      // Query symmetry frequency of features that intersect the buffer polygon
      queryLayerViewSymStats(buffer).then(function (newData) {
        // Create a frequency chart from the returned result
        updateChart(newData);
      });
  
      // Update label graphic to show the length of the polyline
      labelGraphic.geometry = edgeGraphic.geometry;
      labelGraphic.symbol = {
        type: 'text',
        color: '#000000',
        text: length.toFixed(2) + ' kilometers',
        xoffset: 50,
        yoffset: 10,
        font: {
          // autocast as Font
          size: 14,
          family: 'sans-serif',
        },
      };
    }
  
    // draw the buffer polygon when the view loads
    function drawBufferPolygon() {
      // When pause() is called on the watch handle, the callback represented by the
      // watch is no longer invoked, but is still available for later use
      // this watch handle will be resumed when user searches for a new location
      pausableWatchHandle.pause();
  
      // Initial location for the center, edge and polylines on the view
      const viewCenter = view.center.clone();
      const centerScreenPoint = view.toScreen(viewCenter);
      const centerPoint = view.toMap({
        x: centerScreenPoint.x + 120,
        y: centerScreenPoint.y - 120,
      });
      const edgePoint = view.toMap({
        x: centerScreenPoint.x + 240,
        y: centerScreenPoint.y - 120,
      });
  
      // Store updated vertices
      const vertices = [
        [centerPoint.x, centerPoint.y],
        [edgePoint.x, edgePoint.y],
      ];
  
      // Create center, edge, polyline and buffer graphics for the first time
      if (!centerGraphic) {
        const polyline = new Polyline({
          paths: vertices,
          spatialReference: view.spatialReference,
        });
  
        // get the length of the initial polyline and create buffer
        const length = geometryEngine.geodesicLength(polyline, unit);
        const buffer = geometryEngine.geodesicBuffer(centerPoint, length, unit);
  
        // Create the graphics representing the line and buffer
        const pointSymbol = {
          type: 'simple-marker',
          style: 'circle',
          size: 10,
          color: [0, 255, 255, 0.5],
        };
        centerGraphic = new Graphic({
          geometry: centerPoint,
          symbol: pointSymbol,
          attributes: {
            center: 'center',
          },
        });
        edgeGraphic = new Graphic({
          geometry: edgePoint,
          symbol: pointSymbol,
          attributes: {
            edge: 'edge',
          },
        });
        polylineGraphic = new Graphic({
          geometry: polyline,
          symbol: {
            type: 'simple-line',
            color: [127, 127, 127, 1],
            width: 2,
          },
        });
        bufferGraphic = new Graphic({
          geometry: buffer,
          symbol: {
            type: 'simple-fill',
            color: [150, 150, 150],
            outline: {
              color: '#000000',
              width: 2,
            },
          },
        });
        labelGraphic = labelLength(edgePoint, length);
  
        // Add graphics to layer
        graphicsLayer.addMany([
          centerGraphic,
          edgeGraphic,
          polylineGraphic,
          labelGraphic,
        ]);
        // once center and edge point graphics are added to the layer,
        // call sketch's update method pass in the graphics so that users
        // can just drag these graphics to adjust the buffer
        setTimeout(function () {
          sketchViewModel.update([edgeGraphic, centerGraphic], {
            tool: 'move',
          });
        }, 1000);
  
        bufferLayer.addMany([bufferGraphic]);
      }
      // Move the center and edge graphics to the new location returned from search
      else {
        centerGraphic.geometry = centerPoint;
        edgeGraphic.geometry = edgePoint;
      }
  
      // Query features that intersect the buffer
      calculateBuffer(vertices);
    }
  
    // Label polyline with its length
    function labelLength(geom, length) {
      return new Graphic({
        geometry: geom,
        symbol: {
          type: 'text',
          color: '#000000',
          text: length.toFixed(2) + ' kilometers',
          xoffset: 50,
          yoffset: 10,
          font: {
            // autocast as Font
            size: 14,
            family: 'sans-serif',
          },
        },
      });
    }
  
    // TODO: needs rewrite due to database change
    // spatially query the feature layer view for statistics using the updated buffer polygon
    function queryLayerViewSymStats(buffer) {
      // Data storage for the chart
      let syms = [];
      let counts = [];
  
      // Client-side spatial query:
      // Get a sum of age groups for census tracts that intersect the polygon buffer
      const query = featureLayerView.layer.createQuery();
      query.where = getWhereClause();
      query.groupByFieldsForStatistics = symField;
      query.outStatistics = {
        onStatisticField: symField,
        outStatisticFieldName: symField + '_TOTAL',
        statisticType: 'count',
      };
      query.orderByFields = [symField + '_TOTAL DESC'];
      query.geometry = buffer;
  
      // Query the features on the client using FeatureLayerView.queryFeatures
      return featureLayerView
        .queryFeatures(query)
        .then(function (results) {
          // Loop through attributes and save the values for use in the frequency chart
          for (var graphic of results.features) {
            row = graphic.attributes;
            for (var property in row) {
              if (property.includes('TOTAL')) {
                counts.push(row[property]);
              } else {
                syms.push(row[property]);
              }
            }
          }
          return [syms, counts];
        })
        .catch(function (error) {
          console.log(error);
          console.log("Where clause was: " + query.where);
        });
    }
  
    // Chart is created using the Chart.js library
    var chart;
    function updateChart(newData) {
      var syms = newData[0];
      var counts = newData[1];
  
      if (!chart) {
        // Get the canvas element and render the chart in it
        const canvasElement = document.getElementById('chart');
  
        chart = new Chart(canvasElement.getContext('2d'), {
          type: 'bar',
          data: {
            labels: syms,
            datasets: [
              {
                data: counts,
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
              },
            ],
          },
          options: {
            responsive: false,
            title: {
              display: true,
              text: 'Symmetry Occurrences',
            },
            scales: {
              xAxes: [
                {
                  autoSkip: false,
                },
              ],
              yAxes: [
                {
                  min: 0,
                  scaleLabel: {
                    display: true,
                    labelString: 'Number',
                  },
                },
              ],
            },
            legend: {
              display: false
            },
            animation: {
              duration: 0,
            },
            responsiveAnimationDuration: 0,
          },
        });
      } else {
        chart.data.labels = syms;
        chart.data.datasets[0].data = counts;
        chart.update();
      }
    }
  
    // TODO: needs rewrite due to database change
    function updateLayerView() {
      if (featureLayerView === undefined) {
        return;
      }
      // recolor the symmetries
      if (!selectedSymmetries.includes('All')) {
        var newColoring = [];
        // update coloring, SQL query for each selected symmetry
        for (var i = 0; i < selectedSymmetries.length; i++) {
          var sym = selectedSymmetries[i];
          // render each unique symmetry in a new color
          newColoring.push({
            value: sym,
            symbol: { type: 'simple-marker', size: 6, color: colors[i] },
            label: sym,
          });
        }
        // update coloring
        dataLayer.renderer = uniqueRenderer;
        dataLayer.renderer.uniqueValueInfos = newColoring;
      } else {
        updateColoring(dataLayer);
      }
      featureLayerView.filter = {
        where: getWhereClause(),
      };
      featureLayerView.queryFeatureCount().then(function (count) {
        updateDesignCount(count);
      });
      queryLayerViewSymStats(bufferGraphic.geometry).then(function (
        newData
      ) {
        updateChart(newData);
      });
    }
  
    // TODO: I think this will end up being deleted
    function getWhereClause() {
      var timeClause = '';
      var symClause = '';
      if (!document.getElementById('ignoreTime').checked) {
        // select designs that could have been created in the selected year
        var timeSelection = timeSlider.values[0];
        timeClause += 'earliest_date <= ' + timeSelection + ' and latest_date >= ' + timeSelection;
      }
      // match where symField is equal to any of
      // the selected symmetries in the filter drop down
      if (!selectedSymmetries.includes('All')) {
        symClause += '(1 = 0 '; // just to avoid trying to remove the 'or' on i = 0
  
        // SQL query for each selected symmetry
        for (var i = 0; i < selectedSymmetries.length; i++) {
          var sym = selectedSymmetries[i];
          // if sym contains an apostrophe (single quote),
          // add in an additional apostrophe to escape it in the SQL query
          var apostrophe = sym.indexOf("'");
          if (apostrophe > -1) {
            sym = sym.substring(0, apostrophe) + "'" + sym.substring(apostrophe);
          }
          symClause += ' or ' + symField + " = '" + sym + "'";
        }
        symClause += ')';
      }
      if (timeClause !== '' && symClause !== '') {
        return timeClause + ' and ' + symClause;
      } else {
        return timeClause + symClause;
      }
    }
  
    // update the html element saying how many designs the map is showing
    function updateDesignCount(count) {
      document.getElementById('results').innerHTML =
        'Displaying ' + count + ' designs.';
    }
  });
  