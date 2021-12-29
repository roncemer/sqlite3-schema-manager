# sqlite3-schema-manager

A schema manager for SQLite3.  Can be used under Nativescript, or any other JavaScript environment where Node modules are supported and an sqlite3 interface is available.

# License

Licensed under the MIT license

Copyright 2021 Ronald B. Cemer

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

# Installation

To install for React Native:
```
  yarn add react-native-sqlite-storage
  yarn add sqlite3-schema-manager
```

To install for Nativescript:
```
  ns plugin add @nativescript-community/sqlite
  npm install sqlite3-schema-manager --save
```

# Usage

```
Example usage in Nativescript:

import { openOrCreate } from "@nativescript-community/sqlite"
import { SQLite3SchemaManager } from "sqlite3-schema-manager"

const debug = SQLite3SchemaManager.DEBUG_PROGRESS | SQLite3SchemaManager.DEBUG_SELECTS | SQLite3SchemaManager.DEBUG_UPDATES;

try {
  await updateDBSchema(debug);
  if ((debug && SQLite3SchemaManager.DEBUG_PROGRESS) != 0) console.log('updateDBSchema() succeeded');
} catch (ex) {
  console.error(ex);
  throw ex;
}

async function updateDBSchema(debug) {
  let tbldefs = [
    {
        name:'setting',
        columns:[
            {name:'setting_name', type:'nvarchar(64)', notnull:true, dflt_value:''},
            {name:'setting_value', type:'text', notnull:true, dflt_value:''},
        ],
        indexes:[
            // for origin: c=regular index; u=unique index; pk=primary key
            {name:'setting_setting_name', origin:'u', columns:['setting_name']},
        ],
        insert_on_create:[
            {setting_name:'my_setting', setting_value:'hello there!'},
        ],
        insert_if_not_exists:[
            {
                identifiers:{setting_name:'another_setting'},
                other_values:{setting_value:'hello there!'}
            },
        ],
        update_if_exists:[
            {
                identifiers:{setting_name:'yet_another_setting'},
                other_values:{setting_value:'this is interesting.'}
            },
        ],
        delete_if_exists:[
            {setting_name:'one_bad_setting'}
        ],
    },

    {
        name:'family',
        columns:[
            {name:'id', type:'INTEGER', notnull:true, dflt_value:0},
            {name:'reference', type:'VARCHAR(32)', notnull:true, dflt_value:''},
            {name:'name', type:'TEXT', notnull:true, dflt_value:''},
            {name:'unite', type:'VARCHAR', notnull:true, dflt_value:''},
        ],
        indexes:[
            // for origin: c=regular index; u=unique index; pk=primary key
            {name:'', origin:'pk', columns:['id']},
        ],
    },

    {
        name:'article',
        columns:[
            {name:'id', type:'INTEGER', notnull:true, dflt_value:0},
            {name:'reference', type:'VARCHAR(32)', notnull:true, dflt_value:''},
            {name:'name', type:'TEXT', notnull:true, dflt_value:''},
            {name:'quantity', type:'REAL', notnull:true, dflt_value:'0'},
            {name:'unite', type:'VARCHAR', notnull:true, dflt_value:''},
            {name:'purchased', type:'INTEGER', notnull:true, dflt_value:'0'},
            {name:'reserved', type:'INTEGER', notnull:true, dflt_value:'0'},
            {name:'sold', type:'INTEGER', notnull:true, dflt_value:'0'},
            {name:'available', type:'INTEGER', notnull:true, dflt_value:'0'},
            {name:'minimum', type:'INTEGER', notnull:true, dflt_value:'0'},
            {name:'family_id', type:'INTEGER', notnull:true, dflt_value:'0'},
        ],
        indexes:[
            // for origin: c=regular index; u=unique index; pk=primary key
            {name:'', origin:'pk', columns:['id']},
        ],
        foreign_keys:[
            {
                table:'family',
                references:[
                    {from:'family_id', to:'id'},
                ],
                on_update:'RESTRICT',
                on_delete:'RESTRICT',
            },
        ],
    },
  ];

  const db = openOrCreate("com.example.example-data.db");
  await db.transaction(() => SQLite3SchemaManager.updateSchemasForAllTables(
    tbldefs,
    function(sql) { // select
      return db.select(sql);
    },
    function(sql) { // execute
      return db.execute(sql);
    },
    debug
  ));
  if ((debug && SQLite3SchemaManager.DEBUG_PROGRESS) != 0) console.log('db.transaction() returned successfully');
} // updateDBSchema()
```
