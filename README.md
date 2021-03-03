# PHIMATICS_Discovery_Pipeline

Steps to push to update Cloud Functions Action
See docs: https://cloud.ibm.com/docs/openwhisk?topic=openwhisk-actions

### Install packages
npm install

### Create zip file
zip -r discoveryPipeline.zip .

### Verify/find your cloud functions namespace.
ibmcloud fn namespace list

### Target the ibmcloud namespace
ibmcloud fn namespace target {Namespace}

### Create new action
ibmcloud fn action create discoveryPipeline discoveryPipeline.zip --kind nodejs:12

### Update action (If the action has already been created)
ibmcloud fn action update discoveryPipeline discoveryPipeline.zip --kind nodejs:12
