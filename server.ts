import * as dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import twilio, { Twilio } from 'twilio';
import PouchDB from 'pouchdb';
import * as pouchFind from 'pouchdb-find';

dotenv.config();

const port = process.env.PORT || 5000;
const allowedOrigins = ['http://localhost:3000'];

const app = express();
app.use(express.json());

const options: cors.CorsOptions = {
  origin: allowedOrigins
};

app.use(cors(options));

export interface VideoRoom {
  _id: string,
  _rev: string;
  name: string;
  breakouts: BreakoutRoom[];
  archived: boolean;
}

export interface BreakoutRoom {
  _id: string;
  name: string;
}

const db = new PouchDB<VideoRoom>('video_rooms');
PouchDB.plugin(pouchFind);

db.createIndex({
  index: { fields: ['archived'] }
});

const twilioClient = new Twilio(
  process.env.TWILIO_API_KEY as string,
  process.env.TWILIO_API_SECRET as string,
  { accountSid: process.env.TWILIO_ACCOUNT_SID as string }
);

/**
 * Create a new main room
 */
const createRoom = async (request: Request, response: Response) => {
  // Get the room name from the request body.
  const roomName: string = request.body.roomName || '';

  try {
    // Call the Twilio video API to create the new room.
    const room = await twilioClient.video.rooms.create({
        uniqueName: roomName,
        type: 'group'
      });

    const mainRoom: VideoRoom = {
      _id: room.sid,
      _rev: '',
      name: room.uniqueName,
      breakouts: [],
      archived: false,
    }

    // Save the document in the db.
    await db.put(mainRoom);

    // Return the room details in the response.
    return response.status(200).send({
      message: `New video room ${mainRoom.name} created`,
      room: mainRoom
    });

  } catch (error) {
    // If something went wrong, handle the error.
    return response.status(400).send({
      message: `Unable to create new room with name=${roomName}`,
      error
    });
  }
};

/**
 * Create a new breakout room
 */
const createBreakoutRoom = async (request: Request, response: Response) => {
  // Get the roomName and parentSid from the request body.
  const roomName: string = request.body.roomName || '';
  const parentSid: string = request.body.parentSid || '';

  try {
    // Call the Twilio video API to create the new room.
    const room = await twilioClient.video.rooms.create({
        uniqueName: roomName,
        type: 'group'
      });

    const breakoutRoom: BreakoutRoom = {
      name: room.uniqueName,
      _id: room.sid,
    }

    // Save the new breakout room on its parent's record (main room).
    const mainRoom: VideoRoom = await db.get(parentSid);
    mainRoom.breakouts.push(breakoutRoom);
    await db.put(mainRoom);

    // Return the full room details in the response.
    return response.status(200).send({
      message: `Breakout room ${breakoutRoom.name} created`,
      room: mainRoom
    });

  } catch (error) {
    // If something went wrong, handle the error.
    return response.status(400).send({
      message: `Unable to create new breakout room with name=${roomName}`,
      error
    });
  }
};

/**
* List active video rooms
*/
const listActiveRooms = async (request: Request, response: Response) => {
  try {
    // Get the last 20 rooms that are still currently in progress.
    const rooms = await twilioClient.video.rooms.list({status: 'in-progress', limit: 20});

    // Sync the status of the rooms in your db with their statuses coming back from the Twilio API.
    let activeRoomSids = rooms.map((room) => room.sid);

    // Find all video rooms in your database that are not archived.
    let dbActiveRooms: PouchDB.Find.FindResponse<VideoRoom> = await db.find({
      selector: {
        archived: false
      }
    });

    // Filter to get the db docs that are not yet archived but also not in the active rooms list.
    let docsToUpdate = dbActiveRooms.docs.filter(room => {
      return (!activeRoomSids.includes(room._id) && !room.archived)
    })

    // Update the documents that need to be archived.
    docsToUpdate.forEach((doc) => {
        doc.archived = true;
    });

    // Then, bulk save those docs to the database.
    db.bulkDocs(docsToUpdate)

    // Get the revised list of active room documents.
    let dbUpdatedActiveRooms = await db.find({
      selector: {
        archived: false
      }
    });

    // Return the list of active rooms to the client side.
    return response.status(200).send({
      rooms: dbUpdatedActiveRooms.docs
    });

  } catch (error) {
    return response.status(400).send({
      message: `Unable to list active rooms`,
      error
    });
  }
};

/**
 * Get a specific main room by its SID (unique identifier)
 */
const getRoom =  async (request: Request, response: Response) => {
  const sid: string = request.params.sid;

  try {
    // Look up this room in the database.
    let videoRoom: VideoRoom = await db.get(sid);

    // Call the Twilio video API to retrieve the room you created.
    const room = await twilioClient.video.rooms(sid).fetch();

    // If the room is active, return its details to the client side.
    if (room.status === 'in-progress') {
      return response.status(200).send({room: videoRoom});
    } else {
      // If room is inactive, update its document in the database.
      if (!videoRoom.archived) {
        videoRoom.archived = true;
        await db.put(videoRoom);
      }
      // Let the client side know that this room is not active.
      return response.status(200).send({
        message: `Room ${room.uniqueName} is no longer active.`
      });
    }

  } catch (error) {
    console.log(error)
    return response.status(400).send({
      message: `Unable to get room with sid=${sid}`,
      error
    });
  }
};

/**
 * Get a token for a user for a video room
 */
const getToken = (request: Request, response: Response) => {
  const AccessToken = twilio.jwt.AccessToken;
  const VideoGrant = AccessToken.VideoGrant;

  // Get the user's identity and roomSid from the query.
  const { identity, roomSid } = request.body;

// Create the access token.
const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID as string,
    process.env.TWILIO_API_KEY as string,
    process.env.TWILIO_API_SECRET as string,
    { identity: identity as string }
  );

  token.identity = identity;

  // Add a VideoGrant to the token to allow the user of this token to use Twilio Video
  const grant = new VideoGrant({ room: roomSid as string });
  token.addGrant(grant);

  response.json({
    accessToken: token.toJwt()
  });
};

app.post('/rooms/main', createRoom);
app.post('/rooms/breakout', createBreakoutRoom);
app.get('/rooms/', listActiveRooms);
app.get('/rooms/:sid', getRoom);
app.post('/token', getToken);

app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});