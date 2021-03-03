# PHIMATICS_Discovery_Pipeline

Steps to push to update Cloud Functions Action

### Install packages
npm install

### Create zip file
zip -r discoveryPipeline.zip .

### Target the ibmcloud namespace
ibmcloud fn namespace list
ibmcloud fn namespace target {Namespace}

### Create new action
ibmcloud fn action create discoveryPipeline discoveryPipeline.zip --kind nodejs:12

### Update action
ibmcloud fn action update discoveryPipeline discoveryPipeline.zip --kind nodejs:12
