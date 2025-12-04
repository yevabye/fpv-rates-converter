# FPV fligth controller rates converter

## What it can be used for?

This tool helps pilots migrate to new rates by finding values that match their muscle memory from previously used rates


`Betaflight` -> `Actual`\
`Actual` -> `Betaflight`

Betaflight Configurator allows to choose rate styles:
*  **Betaflight rates:** Interaction between `RC Rate`, `Rate`, and `Expo`
*  **Actual rates:** Defined by `Center Sensitivity`, `Max Rate` and `Expo`

## How to use rate converter

1. Select your current rate type (e.g., Betaflight) and enter your values using the **text boxes** or **sliders**. A curve on the graph will represent your current stick feel
   
2. Find corresponding values (user has two ways to find the equivalent values)
* **Automatch:** Click the "Automatch" button. The tool will mathematically calculate and fill in the values that provide the closest possible flight feel to your original rates
* **Manual Adjustment:** Change the target sliders until the two lines overlap. When the lines align perfectly, the overlapping section will turn Violet

Converter uses functions for calculating rates taken from official [Betaflight repository](https://github.com/betaflight) and then uses mathematically derived equations to convert one rate to another


## Resources
* [Betaflight Configurator](https://github.com/betaflight)
* [OscarLiang.com](https://oscarliang.com/rates/)
