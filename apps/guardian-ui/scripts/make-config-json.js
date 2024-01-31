'use strict';

const { writeFile } = require('fs');

const path = './public/config.json';
const config = {
  fm_config_api: process.env.REACT_APP_FM_CONFIG_API ?? '',
  tos: process.env.REACT_APP_FM_TOS ?? '',
};

writeFile(path, JSON.stringify(config, null, 2), (error) => {
  if (error) {
    console.log('An error has occurred ', error);
    return;
  }
  console.log('Data written successfully to disk');
});
