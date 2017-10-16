/**
 * Created by beiwan on 2017/10/15.
 */
var GenerateSchema = require('generate-schema')


var schema = GenerateSchema.json('Product',
    {
        "id": 2,
        "name": "An ice sculpture",
        "price": 12.50,
        "tags": ["cold", "ice"],
        "dimensions": {
            "length": 7.0,
            "width": 12.0,
            "height": 9.5
        },
        "warehouseLocation": {
            "latitude": -78.75,
            "longitude": 20.4
        }
    }
)

console.log(JSON.stringify(schema))
