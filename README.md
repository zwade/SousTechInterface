# SousTechInterface

This repository is used for managing and working with SousTech hardware.

## Setup

Please run `npm install` before attempting to use and of the files in this repository. This is untested on all platforms except for OSX 10.12. Even then, use this at your own risk. 

## Capture

The program `capture.js` is the main program of this project. Once the SousTech prototype has been plugged in, running `./capture.js` will launch a [Blessed](//github.com/chjj/blessed) interface that contains options for interfacing with the prototype.

To get started select `start` from the Actions menu. This will instruct the device to begin transmitting data. From there, you may begin recording by selecting `record`, ping the device by selecting `ping`, or see a full screen line chart by hitting `space`. In addition, if you would like to see the data as it is coming in, you may select `Show Data` from options. 

![interface](https://raw.githubusercontent.com/zwade/SousTechInterface/master/static/capture.png)

## ARFF Generator

In order to run the data through WEKA, you need to generate an ARFF file for it. The `prepareData.js` script will do this, although it expects the data to be organized in folders within the `data` directory. Once you have done this, update the `classes` array to contain these folders and run the script. The output will be located in `/training/training.arff`. 

## Live Classification

For live classification, run use the `prepareData.js` script to generate a WEKA compatible file, then use a `Randomized Tree Classifier` to generate a model. Once the model has been created, copy the resultign tree into `weka.tree`. The next time you run `./capture.js`, `wekaParse.js` will translate the tree into JavaScript, and then load it.
