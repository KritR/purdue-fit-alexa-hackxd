var http = require('https');


/**
 * This sample demonstrates a simple skill built with the Amazon Alexa Skills Kit.
 * The Intent Schema, Custom Slots, and Sample Utterances for this skill, as well as
 * testing instructions are located at http://amzn.to/1LzFrj6
 *
 * For additional samples, visit the Alexa Skills Kit Getting Started guide at
 * http://amzn.to/1LGWsLG
 */


// --------------- Helpers that build all of the responses -----------------------

const DINING_HALLS = ["earhart", "ford", "windsor", "wiley", "hillenbrand", "1bowl", "Pete's Za"];
const MENU_URL = "https://api.hfs.purdue.edu/menus/v2/locations/";
const ALLERGENS = ["eggs","fish", "gluten", "milk", "peanuts", "shellfish", "soy", "tree nuts", "vegetarian", "vegan", "wheat"];
const COREC_URL = "https://www.purdue.edu/drsfacilityusage/api/CurrentActivity/";
const GROUPX_URL = "https://www.purdue.edu/recwell/programs/fitnessPrograms/fitnessClasses/groupX/classSchedule.php";

function getCorecAvailability(){
    return new Promise((resolve, reject) => {
        http.get(COREC_URL, function(res) {
            res.setEncoding('utf8');

            var body = '';

            res.on('data', function (chunk) {
              body = body + chunk;
            });

            res.on('end',function(){
              if (res.statusCode != 200) {
                resolve("Api call failed with response code " + res.statusCode);
              } else {
                resolve(JSON.parse(body));
              }
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);

        });
    });
}

let speechOutput = ''

getCorecAvailability().then((data) => {
        let totalCounts = new Map();
        let occupancyCounts = new Map();

        data.forEach((loc) => {
            console.log(loc);
            console.log(loc.Location.Zone);
            if(!totalCounts.has(loc.Location.Zone.ZoneName)) {
                totalCounts.set(loc.Location.Zone.ZoneName, 0);
            }if(!occupancyCounts.has(loc.Location.Zone.ZoneName)) {
                occupancyCounts.set(loc.Location.Zone.ZoneName, 0);
            }
            const oldTotal = totalCounts.get(loc.Location.Zone.ZoneName);
            totalCounts.set(loc.Location.Zone.ZoneName, oldTotal + loc.Location.Capacity);
            const oldOccupancy = occupancyCounts.get(loc.Location.Zone.ZoneName);
            occupancyCounts.set(loc.Location.Zone.ZoneName, oldOccupancy + loc.Location.Count);
        });

        for([key,value] of occupancyCounts) {
            speechOutput += ` ${key} is currently ${occupancyCounts[key]} / ${totalCounts[key]} full.`;
        }
        console.log(speechOutput);
});
