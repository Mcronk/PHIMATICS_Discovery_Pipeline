const CloudObjectStorage = require("ibm-cos-sdk");
const csv = require("csvtojson");
const DiscoveryV1 = require("ibm-watson/discovery/v1");
const LanguageTranslatorV3 = require("ibm-watson/language-translator/v3");
const { IamAuthenticator } = require("ibm-watson/auth");

//COS Credentials
const cosConfig = {
  endpoint: "s3.us-south.cloud-object-storage.appdomain.cloud",
  apiKeyId: "{Object Storage API Key}",
  serviceInstanceId: "{Service Instance ID}"
  //FYI serviceInstanceId = service credentials resource_instance_id;
};

//https://cloud.ibm.com/apidocs/discovery
const discovery = new DiscoveryV1({
  version: "2021-01-05",
  authenticator: new IamAuthenticator({
    apikey: "{Discovery API Key}"
  }),
  serviceUrl: "{Discovery Service URL}"
});
const discoveryCollectionId = "{Collection ID}";
const discoveryEnvironmentId = "{ENV ID}";

//https://cloud.ibm.com/apidocs/language-translator
const languageTranslator = new LanguageTranslatorV3({
  version: "2020-12-15",
  authenticator: new IamAuthenticator({
    apikey: "{Translator API Key}"
  }),
  serviceUrl: "{Translator Service URL}"
});

//Main function passing in "args" provided by Cloud Functions Trigger
//https://cloud.ibm.com/docs/openwhisk?topic=openwhisk-pkg_obstorage
async function main(args) {
  var cos = await new CloudObjectStorage.S3(cosConfig); // Instantiate Cloud Object Storage
  let doc = await getItem(cos, args.bucket, args.key); // Pull file from CoS

  //convert .csv to JSON
  if (doc != null) {
    //See https://github.com/Keyang/node-csvtojson
    csvRows = await csv({
      noheader: true,
      output: "csv"
    }).fromString(doc);

    let result = await processRows(csvRows, args.key);
    console.log("Result: " + result);
    return {
      message: result
    };
  }
}

//Use COS API to pull item from CoS based on passed in args from CoS trigger.
async function getItem(cos, bucketName, itemName) {
  console.log(`Retrieving item from bucket: ${bucketName}, key: ${itemName}`);

  let result = await cos
    .getObject({
      Bucket: bucketName,
      Key: itemName
    })
    .promise();
  let parsed = Buffer.from(result.Body).toString();
  // console.log(result.Body);
  return parsed;
}

async function processRows(csvRows, fileName) {
  /**
csvRows is an array of csv Rows. The first is a list of the column names and the remaining are the actual rows.
We need to skip the titles (row 1) and then get the third column (title column) for each row after that
and push it to Watson Discovery

[
'source',      'author',
'title',       'description',
'url',         'urlToImage',
'publishedAt', 'content',
'text'
]
[
"{'id': 'reuters', 'name': 'Reuters'}",
'Reuters Editorial',
"Virus-free UK pilot, symbol of Vietnam's pandemic success, to return home - Reuters",
"Vietnam's most seriously ill COVID-19 patient, a British pilot who at one point seemed close to death, left hospital on Saturday on his way home after a dramatic recovery that attracted national attention.",
'https://www.reuters.com/article/us-health-coronavirus-vietnam-pilot-idUSKCN24C09K',
'https://s4.reutersmedia.net/resources_v2/images/rcom-default.png',
'2020-07-11T08:33:00Z',
'HANOI (Reuters) - Vietnam’s most seriously ill COVID-19 patient, a British pilot who at one point seemed close to death, left hospital on Saturday on his way home after a dramatic recovery that attra… [+1838 chars]',
'HANOI (Reuters) - Vietnam’s most seriously ill COVID-19 patient, a British pilot who at one point seemed close to death, left hospital on Saturday on his way home after a dramatic recovery that attracted national attention.\\n\\nThe case of Stephen Cameron, a pilot for national carrier Vietnam Airlines, became a sensation in Vietnam, where a combination of targeted testing and an aggressive quarantine programme has kept its coronavirus tally to an impressively low 370 cases, and zero deaths.\\n\\n“The odds say that I shouldn’t be here, so I can only thank everybody here for what they’ve done,” Cameron said, leaving hospital in a wheelchair and flanked by doctors holding flowers.\\n\\nThe 43-year-old Scot, who arrived in the Southeast Asian country from Britain in early March, was hospitalised three days after his first flight for Vietnam Airlines, following a visit to a bar in Ho Chi Minh City that became linked to a cluster of coronavirus cases.\\n\\nCameron’s illness and the highly publicised efforts of Vietnam’s doctors to save him became a symbol in Vietnam of the country’s successful fight against the virus.\\n\\nAt one point, medical officials said Cameron, initially identified only as “Patient 91”, had just 10% of his lung capacity and was in critical condition.\\n\\nWith the vast majority of Vietnam’s COVID-19 patients already recovered, the news of a potential first death prompted a national outpouring of support, with dozens of people coming forward as potential lung donors.\\n\\nState doctors turned the volunteers down, saying donated lungs should come from brain-dead donors.\\n\\nBut under round-the clock care, Cameron improved. By June he no longer required a lung transplant and was taken off life support.\\n\\nVietnam spent over $200,000 treating him. Vietnamese doctors will accompany Cameron on the special flight back to Britain, state media said.\\n\\n“As soon as I get fit, I’m coming back,” said Cameron. “I’m still a pilot - my license has lapsed, that’s all.”'
].........]
*/

  let rowResults = await Promise.all(
    csvRows.map(async (row, index) => {
      if (index != 0 && row[2] !== "") {
        let lang = await identifyLanguage(row);
        console.log(lang);
        if (lang != "en") {
          try {
            let translatedRow = await translateRowToEng(row, lang);
          } catch (error) {
            console.log("Unable to translate row successfully: " + row);
            console.log("Error message: " + error);
            translatedRow = row;
          }
          /*
        row[2], title
        row[3], description
        row[7], content
        row[8], text
        */
          let discoveryResult = await discoveryAddDoc(
            translatedRow,
            fileName,
            lang
          );
          return discoveryResult;
        } else {
          let discoveryResult = await discoveryAddDoc(row, fileName, lang);
          return discoveryResult;
        }
      }
    })
  );
  console.log(rowResults);
  return rowResults;
}

//
async function discoveryAddDoc(row, fileName, lang) {
  const addDocumentParams = {
    environmentId: discoveryEnvironmentId,
    collectionId: discoveryCollectionId,
    file: row[8],
    filename: fileName,
    fileContentType: "application/json",
    metadata: { title: row[2], original_language: lang }
  };

  let discoveryResult = await discovery.addDocument(addDocumentParams);
  //console.log(JSON.stringify(discoveryResult, null, 2));

  // discovery
  //   .addDocument(addDocumentParams)
  //   .then(documentAccepted => {
  //     console.log(JSON.stringify(documentAccepted, null, 2));
  //   })
  //   .catch(err => {
  //     console.log("error:", err);
  //   });
  return discoveryResult;
}

async function identifyLanguage(row) {
  const identifyParams = {
    text: row[2] //submit title to identify the language
  };

  let identifiedLanguages = await languageTranslator.identify(identifyParams);
  // console.log(
  //   "\n\n" + JSON.stringify(identifiedLanguages.result.languages, null, 2)
  // );
  let langObj = identifiedLanguages.result.languages;
  let bestLang = await getMax(langObj, "language");
  //console.log(bestLang);

  return bestLang.language;
}

async function translateRowToEng(row, lang) {
  // console.log("\n\n\n\n" + row + "\n" + lang);
  /**
  row[2], title
  row[3], description
  row[7], content
  row[8], text
  translation models: https://cloud.ibm.com/docs/language-translator?topic=language-translator-translation-models
  */
  var langModel = lang + "-en";

  row2Ret = await languageTranslator.translate({
    text: row[2],
    modelId: langModel
  });
  row[2] = JSON.stringify(row2Ret.result.translations[0].translation, null, 2);

  row3Ret = await languageTranslator.translate({
    text: row[3],
    modelId: langModel
  });
  row[3] = JSON.stringify(row3Ret.result.translations[0].translation, null, 2);

  row7Ret = await languageTranslator.translate({
    text: row[7],
    modelId: langModel
  });
  row[7] = JSON.stringify(row7Ret.result.translations[0].translation, null, 2);

  row8Ret = await languageTranslator.translate({
    text: row[8],
    modelId: langModel
  });
  row[8] = JSON.stringify(row8Ret.result.translations[0].translation, null, 2);

  //console.log("\n\n row after translate function: " + row + "\n\n");

  return row;
}

function getMax(arr, prop) {
  var max;
  for (var i = 0; i < arr.length; i++) {
    if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop]))
      max = arr[i];
  }
  return max;
}

exports.main = main; //For access to the main function between multiple files. In this case we use this for OpenWhisk/Cloud Function
