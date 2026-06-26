const apiKey = "AQ.Ab8RN6KWDoCq7pAe8hnU3dLREHsSkliMBV_SbbXCSo451RYF4Q";

async function listModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  console.log(JSON.stringify(data.models.map(m => m.name), null, 2));
}

listModels();
