'use strict';
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


function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: 'PlainText',
            text: output,
        },
        card: {
            type: 'Simple',
            title: `PurdueFit - ${title}\n`,
            content: `PurdueFit - ${output}`,
        },
        reprompt: {
            outputSpeech: {
                type: 'PlainText',
                text: repromptText,
            },
        },
        shouldEndSession,
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: '1.0',
        sessionAttributes,
        response: speechletResponse,
    };
}


// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    const sessionAttributes = {};
    const cardTitle = 'Welcome';
    const speechOutput = 'Welcome to the PurdueFit App. ' +
        'Please state your request. ';
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    const repromptText = 'Please state tell me about the corec or tell me about' +
        'healthy eating or the co-rec';
    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

// AWS
function handleSessionEndRequest(callback) {
    const cardTitle = 'Session Ended';
    const speechOutput = 'Thank you for using the PurdueFit App. Have a nice day!';
    // Setting this to true ends the session and exits the skill.
    const shouldEndSession = true;

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession));
}


function createFoodAttributes(inFood, inFoodTime) {
    return {
        inFood,
        inFoodTime,
    };
}


function createCoRecAttributes(inCorec) {
    return {
        inCorec,
    };
}

function createGroupXAttributes(inGroupX) {
    return {
        inGroupX,
    };
}


function foodMethod(intent, session, callback){
    const cardTitle = intent.name;
    const foodIn = intent.slots.foodType;
    const foodTim = intent.slots.foodTime;
    let hour = (new Date()).getHours();
    let repromptText = '';
    let sessionAttributes = {};
    const shouldEndSession = false;
    let speechOutput = '';
    let inputFoodTime;
    if(foodTim.value == null){
        if(hour > 20 || hour < 2){
            inputFoodTime = "dinner";
        }
        else if (hour > 14){
            inputFoodTime = "lunch";
        }
        else {
            inputFoodTime = "breakfast";
        }
    } else {
        inputFoodTime = foodTim.value;
    }
    let healthy = false;
    let inputFood;
    if(foodIn.value != null) {
        inputFood = foodIn.value;
    } else if(foodIn.value == "healthy") {
        healthy = true;
    }
    
    sessionAttributes = createFoodAttributes(inputFood, inputFoodTime);
    speechOutput = `FOOD will look for ${inputFood} at the time ${inputFoodTime}.`;
    repromptText = "This is the reprompt text lol";
    let date = new Date();
    if(hour >= 22) {
        date = date.setDate(date.getDate()+1);
    } 
    const mealPromise = getFilteredMeals(date);
    mealPromise.then((data) => {
        let filteredMeals = {};
        for(let h = 0; h<data.length; h++) {
            filteredMeals[(data[h]["Location"])] = [];
            for(let i = 0; i<data[h]["Meals"].length; i++) {
                if(data[h]["Meals"][i]["Name"].toLowerCase() != inputFoodTime){
                    continue;
                }
                for(let j = 0; j<data[h]["Meals"][i]["Stations"].length; j++){
                    for(let k = 0; k<data[h]["Meals"][i]["Stations"][j]["Items"].length; k++){
                        const meal = data[h]["Meals"][i]["Stations"][j]["Items"][k];
                        if(meal["Allergens"] && inputFood != null) {
                            const allergenIndex = ALLERGENS.indexOf(inputFood.trim().toLowerCase());// || 0;
                            let filter = !meal["Allergens"][allergenIndex]["Value"];
                            if(ALLERGENS[allergenIndex] == 'vegetarian' || ALLERGENS[allergenIndex] == 'vegan') {
                                filter = !filter;
                            }
                            if(filter) {
                                filteredMeals[(data[h]["Location"])].push(meal);
                            }
                        } else {
                            filteredMeals[(data[h]["Location"])].push(meal);
                        }
                    }
                }
            }
        }

        Object.keys(filteredMeals).forEach(function(key) {
            if(filteredMeals[key].length > 0) {
                speechOutput += ` At ${key} is ${filteredMeals[key].filter((x) => isHealthy(x, healthy)).map((meal) => meal["Name"]).join(", ")}.`;
            }
        });
        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
    });
    
}
function isHealthy(food, filter) {
    const unhealthy = ['sugar', 'cookie', 'cake', 'pastry', 'chip', 'fries', 'cream'];
    if(filter) {
        for(let i = 0; i < unhealthy.length; i++) {
            if(food.includes(unhealthy[i])) {
                return false;
            }
        }
    }
    return true;
}

function corecMethod(intent, session, callback){
    const cardTitle = intent.name;
    let repromptText = '';
    let sessionAttributes = {};
    const shouldEndSession = true;
    let speechOutput = '';
    
    getCorecAvailability().then((data) => {
        let totalCounts = new Map();
        let occupancyCounts = new Map();

        data.forEach((loc) => {
            const zone = loc.Location.Zone.ZoneName;
            if(!totalCounts.has(zone)) {
                totalCounts.set(zone, 0);
            }
            if(!occupancyCounts.has(zone)) {
                occupancyCounts.set(zone, 0);
            }
            const capacity = loc.Location.Capacity || 0;
            const count = loc.Count;
            const oldTotal = totalCounts.get(zone) || 0;
            totalCounts.set(zone, oldTotal + loc.Location.Capacity);
            if(count != null) {
                const oldOccupancy = occupancyCounts.get(zone) || 0;
                occupancyCounts.set(zone, oldOccupancy + loc.Count);
            }
        });

        occupancyCounts.forEach((val, key, map) =>  {
            if(val != null){
                speechOutput += ` ${key} is currently ${occupancyCounts.get(key)} out of ${totalCounts.get(key)} full.`;
            }
        });        
        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
    });
    
}

function groupXMethod(intent, session, callback){
    const cardTitle = intent.name;
    const groupXIn = intent.slots.groupXType;
    let repromptText = '';
    let sessionAttributes = {};
    const shouldEndSession = false;
    let speechOutput = '';
    if (corecIn) {
        const inputgroupX = groupXIn.value;
        sessionAttributes = createGroupXAttributes(inputgroupX);
        speechOutput = `GroupX will look for ${inputgroupX}.`;
        repromptText = "This is the reprompt text lol";
        
    } else {
        speechOutput = "I'm not sure what you just said. Please try again.";
        repromptText = "This is the reprompt text lol";
    }
    getGroupXAvailability().then((data) => {
        var regex = new RegExp();
        callback(sessionAttributes,
            buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
    });
    
}


function getFilteredMeals(date){
    date = date.toISOString().substring(0, 10);
    let promises = [];
    DINING_HALLS.forEach( (diner) => {
        const url = MENU_URL + diner + "/" + date;
        promises.push(new Promise((resolve, reject) => {
            http.get(url, function(res) {
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
        }));
    });
    return Promise.all(promises);
}

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

function getGroupXAvailability(){
    return new Promise((resolve, reject) => {
        http.get(GROUPX_URL, function(res) {
            res.setEncoding('utf8');

            var body = '';

            res.on('data', function (chunk) {
              body = body + chunk;
            });

            res.on('end',function(){
              if (res.statusCode != 200) {
                resolve("Api call failed with response code " + res.statusCode);
              } else {
                resolve(body);
              }
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);

        });
    });
}



// --------------- Events -----------------------

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log(`onSessionStarted requestId=${sessionStartedRequest.requestId}, sessionId=${session.sessionId}`);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log(`onLaunch requestId=${launchRequest.requestId}, sessionId=${session.sessionId}`);

    // Dispatch to your skill's launch.
    getWelcomeResponse(callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log(`onIntent requestId=${intentRequest.requestId}, sessionId=${session.sessionId}`);

    const intent = intentRequest.intent;
    const intentName = intentRequest.intent.name;

    switch(intentName) {
        case 'healthyeating':
            foodMethod(intent, session, callback);
            break;
        case 'corec':
            corecMethod(intent, session, callback);
            break;
        case 'AMAZON.HelpIntent':
            getWelcomeResponse(callback);                                             
        break;
        case 'AMAZON.StopIntent':
        case 'AMAZON.CancelIntent':
            handleSessionEndRequest(callback);        
            break;
        default:
            getWelcomeResponse(callback);                            
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log(`onSessionEnded requestId=${sessionEndedRequest.requestId}, sessionId=${session.sessionId}`);
    // Add cleanup logic here
}


// --------------- Main handler -----------------------

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = (event, context, callback) => {
    try {
        console.log(`event.session.application.applicationId=${event.session.application.applicationId}`);

        /**
         * Uncomment this if statement and populate with your skill's application ID to
         * prevent someone else from configuring a skill that sends requests to this function.
         */
        /*
        if (event.session.application.applicationId !== 'amzn1.echo-sdk-ams.app.[unique-value-here]') {
             callback('Invalid Application ID');
        }
        */

        if (event.session.new) {
            onSessionStarted({ requestId: event.request.requestId }, event.session);
        }

        if (event.request.type === 'LaunchRequest') {
            onLaunch(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'IntentRequest') {
            onIntent(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'SessionEndedRequest') {
            onSessionEnded(event.request, event.session);
            callback();
        }
    } catch (err) {
        callback(err);
    }
};

