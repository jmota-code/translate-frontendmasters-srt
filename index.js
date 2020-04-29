const fs = require("fs");
const JSZip = require("jszip");
const axios = require("axios");
const vtt2srt = require("vtt-to-srt");
const { c: course } = require("minimist")(process.argv.slice(2));
const { default: srtParser2 } = require("srt-parser-2");
const { Translate } = require("@google-cloud/translate").v2;

const parser = new srtParser2();
const translate = new Translate();
const frontendMasterUrl = `https://static.frontendmasters.com/assets/courses/${course}`;
const transcriptFile = `${__dirname}/translations/${course}/transcripts.zip`;
const srtPath = `${__dirname}/translations/${course}/srt`;

const applyRequests = (files) => {
  files.forEach(applyRequest);
};

const applyRequest = (file) => {
  axios
    .get(`${frontendMasterUrl}/${file.replace(".txt", ".vtt")}`)
    .then(vttToSrt)
    .then(srtToObject)
    .then(translateSrt)
    .then(objectToSrt)
    .then(writeFile(file.replace(".txt", ".srt")));
};

const writeFile = (filename) => (srt) => {
  return fs.promises.writeFile(`${srtPath}/${filename}`, srt);
};

const objectToSrt = (srtObj) => {
  return parser.toSrt(srtObj);
};

const srtToObject = (text) => {
  return parser.fromSrt(text);
};

const translateSrt = async (srtArr) => {
  const middle = Math.ceil(srtArr.length / 2);
  const srtArr1 = srtArr.slice(0, middle);
  const srtArr2 = srtArr.slice(middle);
  const [trans1, trans2] = await Promise.all([
    translateRequest(srtArr1),
    translateRequest(srtArr2),
  ]);
  const translations = [...trans1, ...trans2];

  return srtArr.map((srtObject, i) => ({
    ...srtObject,
    text: translations[i],
  }));
};

const translateRequest = async (srtArr) => {
  let [translations] = await translate.translate(
    srtArr.map((srtObject) => srtObject.text),
    {
      to: "es",
      model: "nmt",
    }
  );

  return translations;
};

const vttToSrt = ({ data }) => {
  return new Promise((resolve) => {
    const srtStream = vtt2srt();
    srtStream.write(data);
    srtStream.end(() => resolve(srtStream.read().toString("utf-8")));
  });
};

const writeStream = (stream, file) => {
  return new Promise((resolve, reject) => {
    stream.pipe(fs.createWriteStream(file));
    stream.on("end", () => resolve());
    stream.on("error", (error) => reject(error));
  });
};

const createFolder = () => {
  if (!fs.existsSync(srtPath)) {
    return fs.promises.mkdir(srtPath, { recursive: true });
  }
  return Promise.resolve();
};

createFolder()
  .then(() =>
    axios({
      method: "get",
      responseType: "stream",
      url: `${frontendMasterUrl}/transcripts.zip`,
    })
  )
  .then(({ data }) => writeStream(data, transcriptFile))
  .then(() => fs.promises.readFile(transcriptFile))
  .then((data) => JSZip.loadAsync(data).then((zip) => Object.keys(zip.files)))
  .then(applyRequests);
