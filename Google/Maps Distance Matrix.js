var TTS_WotGeoLocationPlanning = Class.create();
TTS_WotGeoLocationPlanning.prototype = {
	initialize: function() {
	},
	
	searchArea: function (centerLat, centerLong, searchAreaFactor) {
		/*
		This function returns an encoded query an represents a virtual search quadrant on the map.
		The system sees the center location values as string.
		By multiplying by 1 the string will become a decimal
		The zoom factor increases the size of the search quadrant
 		*/
		topLat = (1*centerLat)+(searchAreaFactor*0.1);
		btmLat = (1*centerLat)-(searchAreaFactor*0.1);
		leftLong = (1*centerLong)-(searchAreaFactor*0.2);
		rghtLong = (1*centerLong)+(searchAreaFactor*0.2);
		
		locationQuery = 'location.u_adjusted_latitudeBETWEEN' + btmLat + '@' + topLat + '^location.u_adjusted_longitudeBETWEEN' + leftLong + '@' + rghtLong;
		
		return locationQuery;
	},
	
	buildHtmlATag: function (calculatedQuery) {
		//build the link to the list of wm_tasks for the location
		
		//get the instances url so we can link back to it
		var uri = gs.getProperty("glide.servlet.uri");
		
		// We have to embed the URL query values into a new querystring so this string must be URI component encoded
		var Query = encodeURIComponent(calculatedQuery);
		var link = 'href=' + uri + 'wm_task_list.do?sysparm_query=' + Query;
		
		//build the html value to be displayed when you click the map icon
		var htmlATag ='<a ' + link + '>' + loc.getDisplayValue() + ' (' + calculatedCount + ')</a>';
		
		return htmlATag;
	},
	
	getTaskCount: function (tableName, baseQueryWOTs, locationQuery, aggregate, aggregatedField) {
		// Retreive a record count concerning the location and the base query
		var tasks = 0;
		var gaCount = new GlideAggregate(tableName);
		gaCount.addEncodedQuery(baseQueryWOTs);
		gaCount.addEncodedQuery(locationQuery);
		gaCount.addAggregate(aggregate, aggregatedField);
		gaCount.query();
		
		if (gaCount.next())
			tasks = gaCount.getAggregate(aggregate, aggregatedField);
		
		return tasks;
	},
	
	getTaskCounts: function (tableName, baseQueryWOTs, locationQuery, aggregate, aggregatedField) {
		var gaCounts = new GlideAggregate(tableName);
		gaCounts.addEncodedQuery(baseQueryWOTs);
		gaCounts.addEncodedQuery(locationQuery);
		gaCounts.addAggregate(aggregate, aggregatedField);
		gaCounts.query();
		
		return gaCounts;
	},
	
	getDistanceFromLatLonInKm: function (lat1, lon1, lat2, lon2) {
		var R = 6371; // Radius of the earth in km
		var dLat = this.deg2rad(lat2-lat1);  // deg2rad below
		var dLon = this.deg2rad(lon2-lon1);
		var a =
		Math.sin(dLat/2) * Math.sin(dLat/2) +
		Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
		Math.sin(dLon/2) * Math.sin(dLon/2)
		;
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		var d = R * c; // Distance in km
		return d;
	},
	
	deg2rad: function (deg) {
		return deg * (Math.PI/180);
	},
	
	setLocationMatrixItem: function (from, to, distance, travelTime, checkExisting) {
		var gr = new GlideRecord('u_location2location');
		
		if (checkExisting){
			gr.addQuery('u_from_location', from);
			gr.addQuery('u_to_location', to);
			gr.query();
			
			/*
			Check if the m2m relation exists based on location from and to
			If it's not existing it creates a new record. Otherwise its creating a new one
 			*/
			if (gr.next()) {
				gr.u_distance = distance;
				gr.u_travel_time = travelTime;
				gr.update();
			}
			else {
				gr.initialize();
				gr.u_from_location = from;
				gr.u_to_location = to;
				gr.u_distance = distance;
				gr.u_travel_time = travelTime;
				gr.update();
			}
		}
		else {
			gr.initialize();
			gr.u_from_location = from;
			gr.u_to_location = to;
			gr.u_distance = distance;
			gr.u_travel_time = travelTime;
			gr.update();
		}
	},
	
	getDistanceMatrix: function (originCoords, destinationCoords, originId, destinatonId) {
		
		try {
			var r = new sn_ws.RESTMessageV2('REST Google Distance Matrix API', 'post');
			r.setStringParameter('key', 'AIzaSyDwVTdW45eWKV2EKrqPlwP3sBmWZbYobSk');
			r.setStringParameter('origins', originCoords);
			r.setStringParameter('destinations', destinationCoords);
			
			//override authentication profile
			//authentication type ='basic'/ 'oauth2'
			//r.setAuthentication(authentication type, profile name);
			
			var response = r.execute();
			var responseBody = JSON.parse(response.getBody());
			var httpStatus = response.getStatusCode();
			
			if (httpStatus == 200){
				var dis = responseBody.rows[0].elements[0].distance.value;
				var dur = responseBody.rows[0].elements[0].duration.value;
				
				var totalSeconds = dur;
				var hours = ("0" + Math.floor(totalSeconds / 3600)).slice(-2);
				totalSeconds %= 3600;
				var minutes = ("0" + Math.floor(totalSeconds / 60)).slice(-2);
				var seconds =  ("0" + totalSeconds % 60).slice(-2);
				var tm = hours + ":" + minutes + ":" + seconds;
				
				var locOrigin = new GlideRecord('cmn_location');
				locOrigin.addQuery('sys_id', originId);
				locOrigin.query();
				if (locOrigin.next()) {
					locOrigin.u_google_maps_address = responseBody.origin_addresses[0];
					locOrigin.update();
				}
				
				var locDestionation = new GlideRecord('cmn_location');
				locDestionation.addQuery('sys_id', destinatonId);
				locDestionation.query();
				if (locDestionation.next()) {
					locDestionation.u_google_maps_address = responseBody.destination_addresses[0];
					locDestionation.update();
				}
				
				
				var l2l = new GlideRecord('u_location2location');
				l2l.addQuery('u_from_location', originId);
				l2l.addQuery('u_to_location', destinatonId);
				l2l.query();
				if (l2l.next()) {
					l2l.setDisplayValue('u_travel_time', tm);
					l2l.setValue('u_travel_distance', dis);
					l2l.update();
				}
			}
		}
		catch(ex) {
			var message = ex.getMessage();
		}
	},
	
getGoogleTravelTime: function (originCoord, destinationCoord){
		
		try {
			var r = new sn_ws.RESTMessageV2('REST Google Distance Matrix API', 'post');
			r.setStringParameter('key', 'AIzaSyDwVTdW45eWKV2EKrqPlwP3sBmWZbYobSk');
			r.setStringParameter('origins', originCoord);
			r.setStringParameter('destinations', destinationCoord);
			
			//override authentication profile
			//authentication type ='basic'/ 'oauth2'
			//r.setAuthentication(authentication type, profile name);
			
			var response = r.execute();
			var responseBody = JSON.parse(response.getBody());
			var httpStatus = response.getStatusCode();
			
			if (httpStatus == 200){
				var dur = responseBody.rows[0].elements[0].duration.value;
				var totalSeconds = dur;
				var hours = ("0" + Math.floor(totalSeconds / 3600)).slice(-2);
				totalSeconds %= 3600;
				var minutes = ("0" + Math.floor(totalSeconds / 60)).slice(-2);
				var seconds =  ("0" + totalSeconds % 60).slice(-2);
				var tm = hours + ":" + minutes + ":" + seconds;
				return tm;
			}
			else{
				return false;
			}
		}
		catch(ex) {
			return false;
		}
	},
	
	type: 'TTS_WotGeoLocationPlanning'
};
