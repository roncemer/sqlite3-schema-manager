/*
Schema manager for sqlite3.  Can be used under Nativescript, or any other JavaScript environment where Node modules are supported and an sqlite3 interface is available.

Licensed under the MIT license

Copyright 2021 Ronald B. Cemer

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

export async function updateSchemaForSingleTable(tbldef, select, execute, debug) {
    if (typeof(tbldef) != 'object') throw 'updateSchemaForSingleTable(): tbldef argument must be an object';
    if ((typeof(select) != 'function') || (typeof(execute) != 'function')) throw 'updateSchemaForSingleTable(): select and execute arguments must be functions';
    if (typeof(debug) == 'undefined') debug = false;

    function getArray(obj, arrayAttrName) {
        return ((arrayAttrName in obj) && Array.isArray(obj[arrayAttrName])) ? obj[arrayAttrName] : [];
    } // getArray()

    function getObject(obj, objectAttrName) {
        return ((objectAttrName in obj) && (typeof(obj[objectAttrName]) == 'object') && (obj[objectAttrName] !== null)) ? obj[objectAttrName] : {};
    } // getArray()

    function getFKAction(obj, actionAttrName) {
        return ((actionAttrName in obj) && (typeof(obj[actionAttrName]) == 'string')) ? obj[actionAttrName] : 'NO ACTION';
    } // getFKAction()

    function quote(s) {
        if (s === null) return 'NULL';
        var qs = '\''+(String(s).replace('\'', '\'\''))+'\'';
        return qs;
    } // quote()

    function unquote(s) {
        if (s === null) return null;
        if (s == '') return '';
        if ((s.length < 2) || (s.charAt(0) != '\'') || (s.charAt(s.length-1) != '\'')) {
            throw new Exception('Invalid quoted string: '+s);
        }
        if (s.length == 2) {
            return '';
        }
        return s.substring(1, s.length-1).replace('\'\'', '\'');
    } // unquote()

    function doIndexesMatch(idxdef1, idxdef2) {
        if (idxdef1.origin != idxdef2.origin) {
            return false;
        }
        var columns1 = getArray(idxdef1, 'columns'), columns2 = getArray(idxdef2, 'columns');
        if (columns1.length != columns2.length) {
            return false;
        }
        for (var i = 0; i < columns1.length; i++) {
            if (columns1[i] != columns2[i]) {
                return false;
            }
        }
        return true;
    } // doIndexesMatch()

    function doForeignKeysMatch(fkdef1, fkdef2) {
        if ((fkdef1.table != fkdef2.table) ||
            (getFKAction(fkdef1, 'on_update') != getFKAction(fkdef2, 'on_update')) ||
            (getFKAction(fkdef1, 'on_delete') != getFKAction(fkdef2, 'on_delete'))) {
            return false;
        }
        var references1 = getArray(fkdef1, 'references'), references2 = getArray(fkdef2, 'references');
        if (references1.length != references2.length) {
            return false;
        }
        for (var i = 0; i < references1.length; i++) {
            var r1 = references1[i], r2 = references2[i];
            if ((r1.from != r2.from) || (r1.to != r2.to)) {
                return false;
            }
        }
        return true;
    } // doForeignKeysMatch()

    function parseDefaultValue(s) {
        if ((s === null) || (s.toLowerCase() == 'null')) return null;
        return unquote(s);
    } // parseDefaultValue()

    function columnDefinitionToSQL(coldef) {
        var sql = ''+coldef.name+' '+coldef.type+(coldef.notnull ? ' NOT NULL' : ' NULL')+' DEFAULT ';
        if (coldef.dflt_value === null) {
            sql += 'NULL';
        } else {
            sql += quote(coldef.dflt_value);
        }
        return sql;
    } // columnDefinitionToSQL()

    function indexDefinitionToSQL(idxdef, tableName) {
        if ((idxdef.origin == 'c') || (idxdef.origin == 'u')) {
            var idxcolumns = getArray(idxdef, 'columns');
            var sql = 'create '+((idxdef.origin == 'u') ? 'unique ' : '')+' index '+idxdef.name+
                ' on '+tableName+' ('+(idxcolumns.join(', '))+')';
            return sql;
        }
        return '';
    } // indexDefinitionToSQL()

    function foreignKeyDefinitionToSQL(fkdef) {
        var froms = '', tos = '', sep = '';
        var references = getArray(fkdef, 'references');
        references.forEach(function(ref) {
            froms += sep+ref.from;
            tos += sep+ref.to;
            if (sep == '') sep = ', ';
        });
        var sql = 'foreign key ('+froms+') references '+fkdef.table+'('+tos+')'+
            ' on update '+getFKAction(fkdef, 'on_update')+
            ' on delete '+getFKAction(fkdef, 'on_delete');
        return sql;
    } // foreignKeyDefinitionToSQL()

    // tableNameOverride is optional.
    function getCreateTableSQL(tableNameOverride) {
        var tableName = (typeof(tableNameOverride) != 'undefined') ? tableNameOverride : tbldef.name;

        var pk = null, singlePKColumn = null, indexes = getArray(tbldef, 'indexes');
        indexes.forEach(function(idxdef) {
            var idxcolumns = getArray(idxdef, 'columns');
            if (idxdef.origin == 'pk') {
                pk = idxdef;
                var pkcols = getArray(pk, 'columns');
                if (pkcols.length == 1) {
                    singlePKColumn = pkcols[0];
                }
            }
        });

        var sql = 'create table '+tableName+' (';
        var sep = '';
        var columns = getArray(tbldef, 'columns');
        columns.forEach(function(coldef) {
            if ((singlePKColumn !== null) && (coldef.name == singlePKColumn) && (coldef.type == 'INTEGER')) {
                sql += sep+' '+coldef.name+' INTEGER PRIMARY KEY';
                if (sep == '') sep = ",\n";
                pk = null;
            } else {
                sql += sep+' '+columnDefinitionToSQL(coldef);
                if (sep == '') sep = ",\n";
            }
        });

        // If we have an explicit primary key, create that now.
        if (pk !== null) {
            sql += sep+' primary key ('+(getArray(pk, 'columns').join(', '))+')';
            if (sep == '') sep = ",\n";
        }

        var foreign_keys = getArray(tbldef, 'foreign_keys');
        foreign_keys.forEach(function(fkdef) {
            sql += sep+' '+foreignKeyDefinitionToSQL(fkdef);
            if (sep == '') sep = ",\n";
        });

        sql += "\n)";
        return sql;
    } // getCreateTableSQL()

    function getCreateIndexSQLs(tableNameOverride) {
        var tableName = (typeof(tableNameOverride) != 'undefined') ? tableNameOverride : tbldef.name;

        var isqls = [];
        var indexes = getArray(tbldef, 'indexes');
        indexes.forEach(function(idxdef) {
            if ((idxdef.origin == 'c') || (idxdef.origin == 'u')) {
                var isql = indexDefinitionToSQL(idxdef, tableName);
                if (isql != '') {
                    isqls.push(isql);
                }
            }
        });
        return isqls;
    } // getCreateIndexSQLs()

    let columns = getArray(tbldef, 'columns');
    let indexes = getArray(tbldef, 'indexes');
    let foreign_keys = getArray(tbldef, 'foreign_keys');

    async function executeSQLCommands(cmdlist, callback) {
        for (var cmdi = 0; cmdi < cmdlist.length; cmdi++) {
            var sql = cmdlist[cmdi++];
            if (debug) console.log(sql);
            await execute(sql);
        }
    } // executeSQLCommands()

    // Create a missing table, including its indexes and foreign keys.
    // If there are any inserts to be done when the table is created, do those as well.
    async function createMissingTable() {
        await executeSQLCommands([getCreateTableSQL()]);
        await executeSQLCommands(getCreateIndexSQLs());
        var sqls = [];
        getArray(tbldef, 'insert_on_create').forEach(function(ioc) {
            var sql = 'insert into '+tbldef.name+' (', sqlend = ') values (', sep = '';
            for (var cn in ioc) {
                sql += sep+cn;
                sqlend += sep+quote(ioc[cn]);
                if (sep == '') sep = ', ';
            }
            sql += sqlend+')';
            sqls.push(sql);
        });
        await executeSQLCommands(sqls);
        await handleDataTransformations();
    } // createMissingTable()

    // Update an existing table.
    async function updateExistingTable(old_coldefs) {
        var sql, rows, drop_add_col_sqls = [], drop_idx_sqls = [], create_idx_sqls = [], needTableReWrite = false;

        // Index old (from live table) and new (from schema) column definitions by column name.

        var old_coldefs_by_name = {}, old_pk_cols_from_table_info = [];
        for (var i = 0; i < old_coldefs.length; i++) {
            var r = old_coldefs[i];
            old_coldefs_by_name[r.name] = {
                name:r.name,
                type:r.type,
                notnull:(((parseInt(r.notnull) || 0) != 0) ? true : false),
                dflt_value:parseDefaultValue(r.dflt_value),
            };
            // Sometimes SQLite doesn't report a primary key index in the index_list() pragma,
            // even though the table has one.  When this happens, it still reports the primary
            // key columns and their order (1-relative) in the table_info() pragma, so we can
            // reconstruct the primary key from that.
            if (r.pk > 0) {
                old_pk_cols_from_table_info.push({name:r.name, idx:r.pk-1});
            }
        }
        old_pk_cols_from_table_info.sort(function(a, b) {
            if (a.idx > b.idx) return 1;
            if (a.idx < b.idx) return -1;
            return 0;
        });
        for (var i = 0; i < old_pk_cols_from_table_info.length; i++) {
            old_pk_cols_from_table_info[i] = old_pk_cols_from_table_info[i].name;
        }

        var new_coldefs_by_name = {};
        columns.forEach(function(coldef) {
            new_coldefs_by_name[coldef.name] = coldef;
        });

        // Figure out which columns we need to drop.
        for (var k in old_coldefs_by_name) {
            if (!(k in new_coldefs_by_name)) {
                drop_add_col_sqls.push('drop column '+k);
            }
        }

        var old_idxdefs_by_name = {}, new_idxdefs_by_name = {}, old_pk = null, new_pk = null, old_foreign_keys = [];

        // Index new (from schema) indexes by index name.
        indexes.forEach(function(idxdef) {
            switch (idxdef.origin) {
            case 'c':
            case 'u':
                new_idxdefs_by_name[idxdef.name] = idxdef;
                break;
            case 'pk':
                new_pk = idxdef;
                break;
            }
        });

        // Figure out which columns we need to add, which columns are common to both old and new,
        // and whether we need to re-write the table.
        // NOTE: This has to be done AFTER the new indexes have been indexed by index name, because
        // it relies on new_pk being set appropriately from the new schema.
        var old_new_common_colnames = [];
        for (var k in new_coldefs_by_name) {
            if (k in old_coldefs_by_name) {
                old_new_common_colnames.push(k);
                var old_coldef = old_coldefs_by_name[k], new_coldef = new_coldefs_by_name[k];

                var is_pk_col = ((new_pk !== null) && (getArray(new_pk, 'columns').indexOf(k) >= 0));
                var is_pk_auto_int_col = (is_pk_col && (new_coldef.type == 'INTEGER') && (new_pk.columns.length == 1));

                if ((!needTableReWrite) &&
                    ((old_coldef.type != new_coldef.type) ||
                        ((!is_pk_col) &&           // notnull is ignored for pk columns
                        (old_coldef.notnull != new_coldef.notnull)) ||
                        ((!is_pk_auto_int_col) &&  // dflt_value is ignored for INTEGER auto-increment pk columns
                        (old_coldef.dflt_value != new_coldef.dflt_value))
                    )
                    ) {
                    needTableReWrite = true;
                }
            } else {
                drop_add_col_sqls.push('add column '+columnDefinitionToSQL(new_coldefs_by_name[k]));
            }
        }

        // Index old (from live table) indexes by index name.
        sql = 'pragma index_list('+quote(tbldef.name)+')';
        if (debug) console.log(sql);
        rows = await select(sql);
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            switch (r.origin) {
            case 'c':
            case 'u':
                var origin = r.origin;
                if ((origin == 'c') && ('unique' in r) && (r.unique != 0)) origin = 'u';
                old_idxdefs_by_name[r.name] = {name:r.name, origin:origin, columns:[]};
                break;
            case 'pk':
                old_pk = {name:r.name, origin:r.origin, columns:[]};
                break;
            }
        }

        async function queryIndexColumns(idxdef) {
            var sql = 'pragma index_info('+quote(idxdef.name)+')';
            if (debug) console.log(sql);
            var rows = await select(sql);
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                idxdef.columns.push(r.name);
            }
        }

        for (var k in old_idxdefs_by_name) {
            await queryIndexColumns(old_idxdefs_by_name[k]);
        }
        if (old_pk !== null) {
            await queryIndexColumns(old_pk);
        }

        // Sometimes SQLite doesn't report a primary key index in the index_list() pragma,
        // even though the table has one.  When this happens, it still reports the primary
        // key columns and their order (1-relative) in the table_info() pragma, so we can
        // reconstruct the primary key from that.
        if ((old_pk === null) && (old_pk_cols_from_table_info.length > 0)) {
            old_pk = {name:'', origin:'pk', columns:old_pk_cols_from_table_info};
        }

        // If the primary key changed in any way, we need to re-write the table.
        if (!needTableReWrite) {
            if (((old_pk === null) != (new_pk === null)) ||
                ((old_pk !== null) && (new_pk !== null) && (!doIndexesMatch(old_pk, new_pk)))) {
                needTableReWrite = true;
            }
        }

        // Query the foreign keys.

        sql = 'pragma foreign_key_list('+quote(tbldef.name)+')';
        if (debug) console.log(sql);
        rows = await select(sql);
        var fks_by_id = {};
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r.id in fks_by_id) {
                fks_by_id[r.id].references.push({from:r.from, to:r.to});
            } else {
                var fk = {
                    table:r.table,
                    references:[{from:r.from, to:r.to}],
                    on_update:r.on_update,
                    on_delete:r.on_delete,
                };
                fks_by_id[r.id] = fk;
                old_foreign_keys.push(fk);
            }
        }

        if (!needTableReWrite) {

            // Compare foreign key definitions between the old and new tables;
            // set needTableReWrite to true if there are any discrepancies.

            if (old_foreign_keys.length != foreign_keys.length) {
                needTableReWrite = true;
            } else {
                for (var i = 0; i < old_foreign_keys.length; i++) {
                    var matchFound = false;
                    for (var j = 0; j < foreign_keys.length; j++) {
                        if (doForeignKeysMatch(old_foreign_keys[i], foreign_keys[j])) {
                            matchFound = true;
                            break;
                        }
                    }
                    if (!matchFound) {
                        needTableReWrite = true;
                    }
                }
            }
        }

        if (needTableReWrite) {

            // The table cannot be altered in place.
            //   * Create a new table under a temporary name without any indexes (except primary key)
            //   * Copy all of the rows from the old table to the new table
            //   * Drop the old table
            //   * Rename the new table
            //   * Create the indexes on the new table

            var tmptn = tbldef.name+'_new_'+new Date().getTime();
            var sqls = [
                getCreateTableSQL(tmptn),
                'insert into '+tmptn+' ('+(old_new_common_colnames.join(','))+')'+
                    ' select '+(old_new_common_colnames.join(','))+' from '+tbldef.name,
                'drop table '+tbldef.name,
                'alter table '+tmptn+' rename to '+tbldef.name,
            ];
            sqls = sqls.concat(getCreateIndexSQLs(tmptn));

            await executeSQLCommands(sqls);

        } else { // if (needTableReWrite)

            // Figure out which indexes we need to drop, which indexes we need to create,
            // and which indexes we need to drop and re-create.

            for (var k in old_idxdefs_by_name) {
                if (!(k in new_idxdefs_by_name)) {
                    drop_idx_sqls.push('drop index '+k);
                }
            }

            for (var k in new_idxdefs_by_name) {
                var ni = new_idxdefs_by_name[k];
                if (k in old_idxdefs_by_name) {
                    if (!doIndexesMatch(old_idxdefs_by_name[k], ni)) {
                        drop_idx_sqls.push('drop index '+k);
                        var isql = indexDefinitionToSQL(ni, tbldef.name);
                        if (isql != '') {
                            create_idx_sqls.push(isql);
                        }
                    }
                } else {
                    var isql = indexDefinitionToSQL(ni, tbldef.name);
                    if (isql != '') {
                        create_idx_sqls.push(isql);
                    }
                }
            }

            // Drop all indexes which need to be dropped.
            await executeSQLCommands(drop_idx_sqls);
            if (drop_add_col_sqls.length > 0) {
                var sql = 'alter table '+tbldef.name+' '+drop_add_col_sqls.join(', ');
                if (debug) console.log(sql);
                await execute(sql);
            }
        } // if (needTableReWrite) ... else

        await executeSQLCommands(create_idx_sqls);
        await handleDataTransformations();
    } // updateExistingTable()

    async function handleDataTransformations() {
        var sqls;

        // Handle "insert_if_not_exists".
        sqls = [];
        getArray(tbldef, 'insert_if_not_exists').forEach(function(insert_if_not_exists) {
            var sqlpart1 = 'insert into '+tbldef.name+' (',
                sqlpart2 = ') select ',
                sqlpart3 = ' where not exists (select 1 from '+tbldef.name+' where ',
                sqlpart4 = ')',
                sepcomma = '', sepand = '',
                identifiers = getObject(insert_if_not_exists, 'identifiers'),
                other_values = getObject(insert_if_not_exists, 'other_values');
            for (var cn in identifiers) {
                var qv = quote(identifiers[cn]);
                sqlpart1 += sepcomma+cn;
                sqlpart2 += sepcomma+qv;
                sqlpart3 += sepand+cn+' = '+qv;

                if (sepcomma == '') sepcomma = ', ';
                if (sepand == '') sepand = ' and ';
            }
            if (sepcomma == '') return;
            for (var cn in other_values) {
                if (cn in identifiers) continue;

                var qv = quote(other_values[cn]);
                sqlpart1 += sepcomma+cn;
                sqlpart2 += sepcomma+qv;

                if (sepcomma == '') sepcomma = ', ';
                if (sepand == '') sepand = ' and ';
            }
            sqls.push(sqlpart1+sqlpart2+sqlpart3+sqlpart4);
        });
        await executeSQLCommands(sqls);

        // Handle "update_if_exists".
        sqls = [];
        getArray(tbldef, 'update_if_exists').forEach(function(update_if_exists) {
            var sql = 'update '+tbldef.name+' set ', sep = '',
                identifiers = getObject(update_if_exists, 'identifiers'),
                other_values = getObject(update_if_exists, 'other_values');
            for (var cn in other_values) {
                sql += sep+cn+' = '+quote(other_values[cn]);
                if (sep == '') sep = ', ';
            }
            if (sep == '') return;
            sql += ' where ';
            sep = '';
            for (var cn in identifiers) {
                sql += sep+cn+' = '+quote(identifiers[cn]);
                if (sep == '') sep = ' and ';
            }
            if (sep == '') return;
            sqls.push(sql);
        });
        await executeSQLCommands(sqls);

        // Handle "delete_if_exists".
        sqls = [];
        getArray(tbldef, 'delete_if_exists').forEach(function(delete_if_exists) {
            var sql = 'delete from '+tbldef.name+' where ', sep = '';
            for (var cn in delete_if_exists) {
                sql += sep+cn+' = '+quote(delete_if_exists[cn]);
                if (sep == '') sep = ' and ';
            }
            if (sep == '') return;
            sqls.push(sql);
        });
        await executeSQLCommands(sqls);
    } // handleDataTransformations()

    // If foreign keys are enabled, temporarily disable them.
    let disabledForeignKeys = false;
    let sql = 'pragma foreign_keys';
    if (debug) console.log(sql);
    let rows = await select(sql);
    if (rows.length > 0) {
        if (rows[0].foreign_keys != 0) {
            await executeSQLCommands(['pragma foreign_keys = 0']);
            disabledForeignKeys = true;
        }
    }

    // Create or update the table's schema.
    sql = 'pragma table_info('+quote(tbldef.name)+')';
    if (debug) console.log(sql);
    rows = await select(sql);
    if (rows.length == 0) {
        // The table doesn't exist.  Create it.
        await createMissingTable();
    } else { // if (rows.length == 0)
        // The table exists.  Update it.
        await updateExistingTable(rows);
    } // if (rows.length == 0) ... else

    // If we disabled foreign keys, re-enable them now.
    if (disabledForeignKeys) {
        await executeSQLCommands(['pragma foreign_keys = 1']);
    }
} // updateSchemaForSingleTable()

export async function updateSchemasForAllTables(tbldefs, select, execute, debug) {
    if (!Array.isArray(tbldefs)) throw 'updateSchemasForAllTables(): tbldefs argument must be an Array';
    if ((typeof(select) != 'function') || (typeof(execute) != 'function')) throw 'updateSchemasForAllTables(): select and execute arguments must be functions';
    if (typeof(debug) == 'undefined') debug = false;

    if (debug) console.log('updateSchemasForAllTables(): tbldefs.length=' + tbldefs.length);
    for (let tblidx = 0; tblidx < tbldefs.length; tblidx++) {
        if (debug) console.log('updateSchemasForAllTables(): calling updateSchemaForSingleTable() tblidx = ' + tblidx);
        await updateSchemaForSingleTable(tbldefs[tblidx], select, execute, debug);
        if (debug) console.log('updateSchemasForAllTables(): updateSchemaForSingleTable() returned');
    }
} // updateSchemasForAllTables()
